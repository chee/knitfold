import {createEffect, createSignal, onSettled, Show} from "solid-js"
import type {JSX} from "@solidjs/web"
import type {ChartColours} from "./chart.ts"
import {ROW} from "./glyphs.ts"
import {openSurface, type Surface} from "./render-client.ts"

// the block's chart (chart.ts), drawn in the render worker: the page sets
// its size, a cell a stitch (ROW as tall as it's wide), and says what's on it

export default function ChartView(props: {
	stitches: Uint8Array | undefined
	width: number
	height: number
	cell: number
	colours: ChartColours
	/** seen from the back */
	flipped: boolean
	/** the stitch under the mouse (x and y as the block's code has them), or none */
	onHover?: (at: {x: number; y: number} | null) => void
	/** what's to be said about it, by it */
	tip?: JSX.Element
}) {
	let canvas!: HTMLCanvasElement
	let surface: Surface | null = null

	function send() {
		const {stitches, width, height, cell, colours, flipped} = props
		if (!surface || !stitches || stitches.length !== width * height) return
		canvas.style.width = `${width * cell}px`
		canvas.style.height = `${height * cell * ROW}px`
		const copy = stitches.slice()
		surface.send({type: "chart", stitches: copy, width, height, cell, colours: {...colours}, flipped}, [copy.buffer])
	}

	createEffect(
		() => [props.stitches, props.width, props.height, props.cell, props.colours, props.flipped],
		() => send(),
	)

	onSettled(() => {
		surface = openSurface(canvas, "chart")
		surface.send({type: "size", width: 0, height: 0, ratio: Math.max(1, devicePixelRatio || 1)})
		send()
		return () => {
			surface?.close()
			surface = null
		}
	})

	// the mouse, over a cell: which stitch it is (the first row's at the
	// bottom; from the back, the columns go the other way)
	const [over, setOver] = createSignal<{x: number; y: number; left: number; top: number} | null>(null)
	function hover(event: PointerEvent) {
		const {width, height, cell, flipped} = props
		const box = canvas.getBoundingClientRect()
		const column = Math.floor((event.clientX - box.left) / cell)
		const fromTop = Math.floor((event.clientY - box.top) / (cell * ROW))
		if (column < 0 || column >= width || fromTop < 0 || fromTop >= height) return leave()
		const x = flipped ? width - 1 - column : column
		const y = height - 1 - fromTop
		const was = over()
		if (was && was.x === x && was.y === y) return
		setOver({x, y, left: (column + 0.5) * cell, top: fromTop * cell * ROW})
		props.onHover?.({x, y})
	}
	function leave() {
		if (!over()) return
		setOver(null)
		props.onHover?.(null)
	}

	return (
		<div class="knitfold-chart" onPointerMove={hover} onPointerDown={hover} onPointerLeave={leave}>
			<canvas ref={canvas} />
			<Show when={over()}>
				{at => (
					<Show when={props.tip}>
						<div
							class="knitfold-chart-tip"
							data-below={at().top < 48 ? "" : undefined}
							style={{left: `${at().left}px`, top: `${at().top < 48 ? at().top + props.cell * ROW : at().top}px`}}>
							{props.tip}
						</div>
					</Show>
				)}
			</Show>
		</div>
	)
}
