// where the scarf is on the page: how big, where, turned and flipped (as
// the stitches view draws it, in its own units, y up), and the sums between
// the two

export interface View {
	/** canvas px per stitch */
	scale: number
	/** where the scarf's (0, 0) is, in canvas px */
	x: number
	y: number
	/** quarter turns, clockwise */
	turn: number
	/** seen from the back */
	flipped: boolean
}

export interface Bounds {
	minX: number
	maxX: number
	minY: number
	maxY: number
}

export interface Band {
	minY: number
	maxY: number
}

// a picture of the scarf, in its own units, that draws itself in a view
export interface Picture {
	bounds: Bounds
	/** where each block is, up it */
	bands: Band[]
	paint(context: Context2D, view: View, size: {width: number; height: number}, picked: Band | null): void
}

// the view's matrix: the scarf's units (y up) to the canvas's (y down),
// turned and flipped. a, b, c, d as canvas's setTransform has them
export function matrixOf(view: Pick<View, "scale" | "turn" | "flipped">) {
	const sx = view.scale * (view.flipped ? -1 : 1)
	const sy = -view.scale
	const turns = ((view.turn % 4) + 4) % 4
	const cos = [1, 0, -1, 0][turns]
	const sin = [0, 1, 0, -1][turns]
	// a quarter turn, after the scale (and the flip)
	return {a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy}
}

export function toScreen(view: View, x: number, y: number) {
	const {a, b, c, d} = matrixOf(view)
	return [a * x + c * y + view.x, b * x + d * y + view.y] as const
}

export function toScarf(view: View, px: number, py: number) {
	const {a, b, c, d} = matrixOf(view)
	const det = a * d - b * c
	const sx = px - view.x
	const sy = py - view.y
	return [(d * sx - c * sy) / det, (-b * sx + a * sy) / det] as const
}

// a box in the scarf's units, on the canvas
export function screenBox(view: View, box: Bounds) {
	const corners = [
		toScreen(view, box.minX, box.minY),
		toScreen(view, box.maxX, box.minY),
		toScreen(view, box.minX, box.maxY),
		toScreen(view, box.maxX, box.maxY),
	]
	const xs = corners.map(([x]) => x)
	const ys = corners.map(([, y]) => y)
	return {left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys)}
}

// the view with the whole scarf in it, turned and flipped as asked, with
// room on the left (or, on its side, underneath) for the blocks' numbers
export function fitAll(bounds: Bounds, width: number, height: number, turn = 0, flipped = false): View {
	const side = turn % 2 === 1
	const left = side ? 16 : 40
	const bottom = side ? 36 : 16
	const margin = 16
	const box = screenBox({scale: 1, x: 0, y: 0, turn, flipped}, bounds)
	const w = Math.max(box.right - box.left, 1)
	const h = Math.max(box.bottom - box.top, 1)
	const scale = Math.max(0.5, Math.min((width - left - margin) / w, (height - margin - bottom) / h))
	const {minX, maxX, minY, maxY} = bounds
	const [cx, cy] = toScreen({scale, x: 0, y: 0, turn, flipped}, (minX + maxX) / 2, (minY + maxY) / 2)
	return {
		scale,
		turn,
		flipped,
		x: left + (width - left - margin) / 2 - cx,
		y: margin + (height - margin - bottom) / 2 - cy,
	}
}

type RGB = [number, number, number]

// a 2d context, on the page or in a worker
export type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

let probe: Context2D | null = null
// any css colour, as rgb (by drawing it: on the page, or in a worker)
export function rgbOf(colour: string): RGB {
	probe ??=
		typeof document === "undefined"
			? new OffscreenCanvas(1, 1).getContext("2d", {willReadFrequently: true})
			: document.createElement("canvas").getContext("2d", {willReadFrequently: true})
	if (!probe) return [0, 0, 0]
	probe.clearRect(0, 0, 1, 1)
	probe.fillStyle = "#000"
	probe.fillStyle = colour
	probe.fillRect(0, 0, 1, 1)
	const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
	return [r, g, b]
}

export const mixRGB = (a: RGB, b: RGB, amount: number): RGB =>
	a.map((value, i) => Math.round(value + (b[i] - value) * amount)) as RGB
export const mix = (a: RGB, b: RGB, amount: number) => `rgb(${mixRGB(a, b, amount).join(" ")})`

