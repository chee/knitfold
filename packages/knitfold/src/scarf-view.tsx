import {createEffect, createMemo, createSignal, For, onSettled, Show} from "solid-js"
import {stitchesLayout, type StitchColours, type WasteRows} from "./glyphs.ts"
import {openSurface, type Surface} from "./render-client.ts"
import type {InkSpace} from "./anchor.ts"
import {fitAll, screenBox, toScarf, toScreen, type Bounds, type Band, type View} from "./view.ts"

// the whole scarf, still, as its stitches: all of it in the pane, the picked
// block washed behind, a line beside each block. scroll to move along it,
// pinch (or ⌘-scroll) to look closer, drag it about, click a block to pick
// it, double-click to see it all again. it's flipped as it's told.
//
// it's drawn in the render worker (render.worker.ts): the page works out
// where the scarf is and which block a click's on, and says so; the worker
// builds the picture and paints it
//
// holding alt (option), a block's dragged instead: from its stitches or its
// line, to between two others, a line where it'll go, and dropped there

const CLICK = 4

type Spaced = HTMLDivElement & {inkSpace?: InkSpace}

/** what's drawn: the blocks' stitches (each as many rows as it has), and
 * their colours */
export interface StitchScene {
	blocks: Uint8Array[]
	width: number
	heights: number[]
	colours: StitchColours
	/** the waste section, under the first block, if it starts on one */
	waste?: WasteRows | null
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
	/** who else is here: a needle each, by the block they're looking at */
	others?: {peerId: string; block: number}[]
	/** each block: is it waiting for something (a doc, a get) */
	waiting?: boolean[]
	onPick: (block: number) => void
	/** a block dragged (holding alt) from one place to another: `to` is where
	 * it is after, among the others */
	onMove?: (from: number, to: number) => void
}) {
	let box!: HTMLDivElement
	let canvas!: HTMLCanvasElement
	let surface: Surface | null = null
	const [size, setSize] = createSignal({width: 0, height: 0})
	const [placed, setPlaced] = createSignal<Placed | null>(null)

	// where the stitches are (the worker has the stitches themselves)
	const layout = createMemo<Layout | null>(() => {
		const scene = props.scene
		return scene ? stitchesLayout(scene.heights, scene.width, scene.waste?.height ?? 0) : null
	}, {
		equals: (a, b) =>
			!!a &&
			!!b &&
			a.bounds.maxX === b.bounds.maxX &&
			a.bounds.minY === b.bounds.minY &&
			a.bands.length === b.bands.length &&
			a.bands.every((band, n) => band.minY === b.bands[n].minY && band.maxY === b.bands[n].maxY),
	})

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

	// the others' needles: beside their block's line, hook up, and if
	// there's more than one there, a little bed of them, outwards from it
	const NEEDLE = {width: 4, height: 14, gap: 2}
	const needles = createMemo(() => {
		const at = tabs()
		const seen = new Map<number, number>()
		return (props.others ?? []).flatMap(other => {
			const tab = at[other.block]
			if (!tab) return []
			const k = seen.get(other.block) ?? 0
			seen.set(other.block, k + 1)
			const step = (NEEDLE.width + NEEDLE.gap) * k
			return tab.axis === "y"
				? [{peerId: other.peerId, left: tab.left - NEEDLE.width + 2 - step, top: tab.top + tab.height / 2 - NEEDLE.height / 2}]
				: [{peerId: other.peerId, left: tab.left + tab.width / 2 - NEEDLE.width / 2 + step, top: tab.top + tab.height - 2}]
		})
	})


	// to the worker: the stitches when they change, the view when it does
	createEffect(
		() => props.scene,
		scene => {
			if (!scene || !surface) return
			const blocks = scene.blocks.map(block => block.slice())
			surface.send(
				{type: "stitches", blocks, width: scene.width, heights: scene.heights, colours: scene.colours, waste: scene.waste ?? null},
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

	// ── a block dragged, holding alt: which, and the gap it's over (0 under
	// the first, the number of blocks over the last)
	const [dragging, setDragging] = createSignal<{from: number; gap: number} | null>(null)
	const [alt, setAlt] = createSignal(false)

	function gapAt(clientX: number, clientY: number) {
		const v = view()
		const shape = layout()
		if (!v || !shape) return 0
		const rect = canvas.getBoundingClientRect()
		const [, y] = toScarf(v, clientX - rect.left, clientY - rect.top)
		return shape.bands.filter(band => (band.minY + band.maxY) / 2 < y).length
	}

	// where the dragged block will go: a line across the scarf, at the gap
	const dropLine = createMemo(() => {
		const drag = dragging()
		const v = view()
		const shape = layout()
		if (!drag || !v || !shape) return null
		// (where it is, or just next to it: it's not going anywhere)
		if (drag.gap === drag.from || drag.gap === drag.from + 1) return null
		const {bands, bounds} = shape
		const y = drag.gap < bands.length ? bands[drag.gap].minY : bounds.maxY
		const at = screenBox(v, {minX: bounds.minX - 0.6, maxX: bounds.maxX + 0.6, minY: y, maxY: y})
		const across = at.right - at.left >= at.bottom - at.top
		return across
			? {left: at.left, top: at.top - 1, width: at.right - at.left, height: 2}
			: {left: at.left - 1, top: at.top, width: 2, height: at.bottom - at.top}
	})

	function onDragDown(event: PointerEvent) {
		if (!event.altKey || event.button !== 0 || !props.onMove) return
		const rect = canvas.getBoundingClientRect()
		const tab = (event.target as Element).closest?.(".knitfold-tab")
		const from = tab ? [...box.querySelectorAll(".knitfold-tab")].indexOf(tab) : blockAt(event.clientX - rect.left, event.clientY - rect.top)
		if (from < 0) return
		// (not a pan, or a click on its line)
		event.preventDefault()
		event.stopPropagation()
		box.setPointerCapture(event.pointerId)
		props.onPick(from)
		setDragging({from, gap: gapAt(event.clientX, event.clientY)})
	}
	function onDragMove(event: PointerEvent) {
		const drag = dragging()
		if (!drag) return
		event.stopPropagation()
		const gap = gapAt(event.clientX, event.clientY)
		if (gap !== drag.gap) setDragging({...drag, gap})
	}
	function onDragUp(event: PointerEvent) {
		const drag = dragging()
		if (!drag) return
		event.stopPropagation()
		setDragging(null)
		if (event.type !== "pointerup") return
		const to = drag.gap > drag.from ? drag.gap - 1 : drag.gap
		if (to !== drag.from) props.onMove?.(drag.from, to)
	}
	const onKey = (event: KeyboardEvent) => setAlt(event.altKey)
	const offAlt = () => setAlt(false)

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
			surface.send({type: "stitches", blocks, width: scene.width, heights: scene.heights, colours: scene.colours, waste: scene.waste ?? null}, blocks.map(block => block.buffer))
		}
		const observer = new ResizeObserver(([entry]) => {
			const {width, height} = entry.contentRect
			surface?.send({type: "size", width, height, ratio: devicePixelRatio || 1})
			setSize({width, height})
		})
		observer.observe(box)
		canvas.addEventListener("wheel", onWheel, {passive: false})
		// (alt's dragging blocks: before the canvas, or a line's button, has it)
		box.addEventListener("pointerdown", onDragDown, true)
		box.addEventListener("pointermove", onDragMove, true)
		box.addEventListener("pointerup", onDragUp, true)
		box.addEventListener("pointercancel", onDragUp, true)
		addEventListener("keydown", onKey)
		addEventListener("keyup", onKey)
		addEventListener("blur", offAlt)
		// for the others' mice (anchor.ts): a point on the page is one on the
		// scarf, in its own units, and back, as it's moved and zoomed here
		;(box as Spaced).inkSpace = {
			at(x, y) {
				const v = view()
				if (!v) return null
				const rect = canvas.getBoundingClientRect()
				const [sx, sy] = toScarf(v, x - rect.left, y - rect.top)
				return [Math.round(sx * 100) / 100, Math.round(sy * 100) / 100]
			},
			place(at) {
				const v = view()
				if (!v || !Array.isArray(at) || !at.every(Number.isFinite)) return null
				const rect = canvas.getBoundingClientRect()
				const [px, py] = toScreen(v, at[0], at[1])
				return {x: rect.left + px, y: rect.top + py, scale: v.scale}
			},
		}
		return () => {
			delete (box as Spaced).inkSpace
			observer.disconnect()
			canvas.removeEventListener("wheel", onWheel)
			box.removeEventListener("pointerdown", onDragDown, true)
			box.removeEventListener("pointermove", onDragMove, true)
			box.removeEventListener("pointerup", onDragUp, true)
			box.removeEventListener("pointercancel", onDragUp, true)
			removeEventListener("keydown", onKey)
			removeEventListener("keyup", onKey)
			removeEventListener("blur", offAlt)
			surface?.close()
			surface = null
		}
	})

	return (
		<div
			class="knitfold-scarfview"
			ref={box}
			data-alt={alt() && props.onMove ? "" : undefined}
			data-dragging={dragging() ? "" : undefined}>
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
							data-waiting={props.waiting?.[n] ? "" : undefined}
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
			<Show when={dropLine()}>
				{line => (
					<div
						class="knitfold-drop"
						aria-hidden="true"
						style={{left: `${line().left}px`, top: `${line().top}px`, width: `${line().width}px`, height: `${line().height}px`}}
					/>
				)}
			</Show>
			<For each={needles()} keyed={false}>
				{needle => (
					<svg
						class="knitfold-other-needle"
						data-peer-id={needle().peerId}
						viewBox="0 0 4 14"
						aria-hidden="true"
						style={{left: `${needle().left}px`, top: `${needle().top}px`}}>
						<path d="M1 14V2.2a1.2 1.2 0 0 1 2.4 0V3.2" />
					</svg>
				)}
			</For>
		</div>
	)
}
