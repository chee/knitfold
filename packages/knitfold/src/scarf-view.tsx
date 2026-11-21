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
	/** who else is here: a dot each, by the block they're looking at */
	others?: {peerId: string; block: number}[]
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

	// the others' dots: beside their block's line, a row of them, outwards
	// from it, if there's more than one there
	const DOT = 9
	const dots = createMemo(() => {
		const at = tabs()
		const seen = new Map<number, number>()
		return (props.others ?? []).flatMap(other => {
			const tab = at[other.block]
			if (!tab) return []
			const k = seen.get(other.block) ?? 0
			seen.set(other.block, k + 1)
			const step = (DOT + 2) * k
			return tab.axis === "y"
				? [{peerId: other.peerId, left: tab.left - DOT - step, top: tab.top + tab.height / 2 - DOT / 2}]
				: [{peerId: other.peerId, left: tab.left + tab.width / 2 - DOT / 2, top: tab.top + tab.height + step}]
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

	// the fingers (or the mouse) down on it: one drags it about, two pinch.
	// each time one comes or goes, the gesture starts again from where the
	// scarf is, with whoever's still down
	const pointers = new Map<number, {x: number; y: number}>()
	let gesture: {view: View; x: number; y: number; distance: number} | null = null
	// (moved, or pinched, since the first went down: not a click)
	let dragged = false

	function where() {
		const rect = canvas.getBoundingClientRect()
		const [a, b] = [...pointers.values()]
		if (!b) return {x: a.x - rect.left, y: a.y - rect.top, distance: 0}
		return {x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top, distance: Math.hypot(a.x - b.x, a.y - b.y)}
	}

	function begin() {
		const v = view()
		gesture = v && pointers.size ? {view: v, ...where()} : null
	}

	function onPointerDown(event: PointerEvent) {
		if (!view() || event.button !== 0) return
		canvas.setPointerCapture(event.pointerId)
		if (!pointers.size) dragged = false
		pointers.set(event.pointerId, {x: event.clientX, y: event.clientY})
		if (pointers.size > 1) dragged = true
		begin()
	}

	function onPointerMove(event: PointerEvent) {
		if (!pointers.has(event.pointerId) || !gesture) return
		pointers.set(event.pointerId, {x: event.clientX, y: event.clientY})
		const now = where()
		const start = gesture.view
		if (!dragged && Math.hypot(now.x - gesture.x, now.y - gesture.y) < CLICK) return
		dragged = true
		if (pointers.size === 1) {
			move({...start, x: start.x + now.x - gesture.x, y: start.y + now.y - gesture.y})
			return
		}
		// what was under the fingers' middle stays under it, as they spread
		const scale = Math.min(48, Math.max(0.5, start.scale * (now.distance / (gesture.distance || 1))))
		const actual = scale / start.scale
		move({...start, scale, x: now.x - (gesture.x - start.x) * actual, y: now.y - (gesture.y - start.y) * actual})
	}

	function onPointerUp(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return
		pointers.delete(event.pointerId)
		if (!pointers.size && !dragged && event.type === "pointerup") {
			const rect = canvas.getBoundingClientRect()
			const n = blockAt(event.clientX - rect.left, event.clientY - rect.top)
			if (n >= 0) props.onPick(n)
		}
		begin()
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
			<canvas
				ref={canvas}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
				onDblClick={() => setPlaced(null)}
			/>
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
			<For each={dots()} keyed={false}>
				{dot => (
					<svg
						class="knitfold-other"
						data-peer-id={dot().peerId}
						viewBox="0 0 18 18"
						aria-hidden="true"
						style={{left: `${dot().left}px`, top: `${dot().top}px`}}>
						<circle class="knitfold-other-ball" cx="9" cy="9" r="8" />
						<path class="knitfold-other-strands" d="M4 5.5c3 1.8 6.5 5 8.5 8.5M7 2.5c3 2 6 5.4 7.6 8.6M2.6 9.5c2.4-2.2 6.6-4.4 11-4.6" />
					</svg>
				)}
			</For>
		</div>
	)
}
