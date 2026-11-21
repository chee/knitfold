import {createEffect, onSettled} from "solid-js"
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

	return <canvas ref={canvas} />
}
