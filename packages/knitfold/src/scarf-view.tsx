import {createEffect, createMemo, createSignal, For, onSettled} from "solid-js"
import {stitchesLayout, type StitchColours} from "./glyphs.ts"
import {openSurface, type Surface} from "./render-client.ts"
import {fitAll, screenBox, toScarf, toScreen, type Bounds, type Band, type View} from "./view.ts"

// the whole scarf, still, as its stitches: all of it in the pane, the picked
// block washed behind, a line beside each block. scroll to move along it,
// pinch (or ⌘-scroll) to look closer, drag it about, click a block to pick
// it, double-click to see it all again. it's flipped as it's told.
//
// it's drawn in the render worker (render.worker.ts): the page works out
// where the scarf is and which block a click's on, and says so; the worker
// builds the picture and paints it

const CLICK = 4

/** what's drawn: the blocks' stitches, and their colours */
export interface StitchScene {
	blocks: Uint8Array[]
	width: number
	height: number
	colours: StitchColours
}

interface Layout {
	bounds: Bounds
	bands: Band[]
}

interface Placed extends View {
	/** the layout this view was set for: a new one's seen whole */
	layout: Layout
}

export default function ScarfView(props: {
	scene: StitchScene | null
	picked: number
	turn: number
	flipped: boolean
	/** the line beside each block (not for one block alone) */
	lines?: boolean
	onPick: (block: number) => void
}) {
	let box!: HTMLDivElement
	let canvas!: HTMLCanvasElement
	let surface: Surface | null = null
	const [size, setSize] = createSignal({width: 0, height: 0})
	const [placed, setPlaced] = createSignal<Placed | null>(null)

	// where the stitches are (the worker has the stitches themselves)
	const layout = createMemo<Layout | null>(() => {
		const scene = props.scene
		return scene ? stitchesLayout(scene.blocks.length, scene.width, scene.height) : null
	}, {equals: (a, b) => a?.bands.length === b?.bands.length && a?.bounds.maxX === b?.bounds.maxX && a?.bounds.maxY === b?.bounds.maxY})

	// where the scarf is: as you left it, or all of it
	const view = createMemo<View | null>(() => {
		const shape = layout()
		const {width, height} = size()
		if (!shape || !width || !height) return null
		const mine = placed()
		if (mine && mine.layout === shape && mine.turn === props.turn) {
			if (mine.flipped === props.flipped) return mine
			// flipped where it is: as big, its middle where it was
			const {minX, maxX, minY, maxY} = shape.bounds
			const [cx, cy] = toScreen(mine, (minX + maxX) / 2, (minY + maxY) / 2)
			const over = {...mine, flipped: props.flipped, x: 0, y: 0}
			const [ox, oy] = toScreen(over, (minX + maxX) / 2, (minY + maxY) / 2)
			return {...over, x: cx - ox, y: cy - oy}
		}
		return fitAll(shape.bounds, width, height, props.turn, props.flipped)
	})

	// each block's line: down its left, or, on its side, along under it
	const tabs = createMemo(() => {
		const v = view()
		const shape = layout()
		if (!v || !shape || props.lines === false) return []
		const whole = screenBox(v, shape.bounds)
		const {minX, maxX} = shape.bounds
		const across = v.turn % 2 === 1
		return shape.bands.map(band => {
			const at = screenBox(v, {minX, maxX, minY: band.minY - 0.4, maxY: band.maxY + 0.4})
			return across
				? {axis: "x", left: at.left, top: whole.bottom + 4, width: at.right - at.left, height: 12}
				: {axis: "y", left: whole.left - 16, top: at.top, width: 12, height: at.bottom - at.top}
		})
	})

	// to the worker: the stitches when they change, the view when it does
	createEffect(
		() => props.scene,
		scene => {
			if (!scene || !surface) return
			const blocks = scene.blocks.map(block => block.slice())
			surface.send(
				{type: "stitches", blocks, width: scene.width, height: scene.height, colours: scene.colours},
				blocks.map(block => block.buffer),
			)
		},
	)
	createEffect(
		() => ({v: view(), picked: props.picked}),
		({v, picked}) => {
			if (v && surface) surface.send({type: "view", view: {...v}, picked})
		},
	)

	function move(next: View) {
		const shape = layout()
		if (shape) setPlaced({...next, layout: shape})
	}

	// which block's here (canvas px), or the nearest
	function blockAt(px: number, py: number) {
		const v = view()
		const shape = layout()
		if (!v || !shape) return -1
		const [, y] = toScarf(v, px, py)
		let best = -1
		let distance = Infinity
		shape.bands.forEach((band, n) => {
			const d = y < band.minY ? band.minY - y : y > band.maxY ? y - band.maxY : 0
			if (d < distance) [best, distance] = [n, d]
		})
		return distance < 2 ? best : -1
	}

	function onWheel(event: WheelEvent) {
		const v = view()
		if (!v) return
		event.preventDefault()
		if (event.ctrlKey || event.metaKey) {
			const rect = canvas.getBoundingClientRect()
			const px = event.clientX - rect.left
			const py = event.clientY - rect.top
			const k = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0025))
			const scale = Math.min(48, Math.max(0.5, v.scale * k))
			const actual = scale / v.scale
			move({...v, scale, x: px - (px - v.x) * actual, y: py - (py - v.y) * actual})
		} else {
			move({...v, x: v.x - event.deltaX, y: v.y - event.deltaY})
		}
	}

	function onPointerDown(event: PointerEvent) {
		const v = view()
		if (!v || event.button !== 0) return
		canvas.setPointerCapture(event.pointerId)
		const start = {x: event.clientX, y: event.clientY, view: v}
		let dragged = false
		const moving = (e: PointerEvent) => {
			const dx = e.clientX - start.x
			const dy = e.clientY - start.y
			if (!dragged && Math.hypot(dx, dy) < CLICK) return
			dragged = true
			move({...start.view, x: start.view.x + dx, y: start.view.y + dy})
		}
		const up = (e: PointerEvent) => {
			canvas.removeEventListener("pointermove", moving)
			canvas.removeEventListener("pointerup", up)
			canvas.removeEventListener("pointercancel", up)
			if (!dragged && e.type === "pointerup") {
				const rect = canvas.getBoundingClientRect()
				const n = blockAt(e.clientX - rect.left, e.clientY - rect.top)
				if (n >= 0) props.onPick(n)
			}
		}
		canvas.addEventListener("pointermove", moving)
		canvas.addEventListener("pointerup", up)
		canvas.addEventListener("pointercancel", up)
	}

	onSettled(() => {
		surface = openSurface(canvas, "stitches")
		// (what there is already: the effects above came first)
		const scene = props.scene
		if (scene) {
			const blocks = scene.blocks.map(block => block.slice())
			surface.send({type: "stitches", blocks, width: scene.width, height: scene.height, colours: scene.colours}, blocks.map(block => block.buffer))
		}
		const observer = new ResizeObserver(([entry]) => {
			const {width, height} = entry.contentRect
			surface?.send({type: "size", width, height, ratio: devicePixelRatio || 1})
			setSize({width, height})
		})
		observer.observe(box)
		canvas.addEventListener("wheel", onWheel, {passive: false})
		return () => {
			observer.disconnect()
			canvas.removeEventListener("wheel", onWheel)
			surface?.close()
			surface = null
		}
	})

	return (
		<div class="knitfold-scarfview" ref={box}>
			<canvas ref={canvas} onPointerDown={onPointerDown} onDblClick={() => setPlaced(null)} />
			<ol class="knitfold-tabs" aria-label="blocks">
				<For each={tabs()} keyed={false}>
					{(tab, n) => (
						<li
							class="knitfold-tab"
							data-axis={tab().axis}
							data-picked={n === props.picked ? "" : undefined}
							style={{
								left: `${tab().left}px`,
								top: `${tab().top}px`,
								width: `${tab().width}px`,
								height: `${tab().height}px`,
							}}>
							<button onClick={() => props.onPick(n)} aria-label={`block ${n + 1}`} />
						</li>
					)}
				</For>
			</ol>
		</div>
	)
}
