/// <reference lib="webworker" />
// knitfold's drawing, off the page's thread: each canvas the page hands
// over (transferControlToOffscreen) is drawn here. the stitches view's
// picture (paths for every V and bump, painted as the page says the view
// is), the block's chart, and knitscape's yarn, its renderer and its camera
// (the page sends its pointer over, as events, and its wheel and clicks).
// the page keeps the sums that are cheap (where the scarf is, which block a
// click's on in the stitches view); what's heavy is here

import {drawChart, type ChartColours} from "./chart.ts"
import {stitchesPicture, type StitchColours} from "./glyphs.ts"
import type {YarnResponse} from "./knitfold.worker.ts"
import {rgbOf, type Picture, type View} from "./view.ts"
import {createNoodleRenderer} from "./vendor/knitscape/shared/simulation/renderer.js"

// what knitscape's renderer expects of the page, here: a window (its camera
// listens on it for the pointer moving), its pixel ratio, and a canvas with
// a css size (an offscreen canvas has none: it's given one, as properties)
const scope = self as unknown as Record<string, unknown>
scope.window = self
scope.devicePixelRatio = 1

export type Kind = "stitches" | "chart" | "knitscape"

export type ToRender =
	| {type: "open"; id: number; kind: Kind; canvas: OffscreenCanvas}
	| {type: "size"; id: number; width: number; height: number; ratio: number}
	| {type: "close"; id: number}
	// the stitches view
	| {type: "stitches"; id: number; blocks: Uint8Array[]; width: number; height: number; colours: StitchColours}
	| {type: "view"; id: number; view: View; picked: number}
	// the chart
	| {type: "chart"; id: number; stitches: Uint8Array; width: number; height: number; cell: number; colours: ChartColours; flipped: boolean}
	// knitscape
	| {
			type: "yarn"
			id: number
			response: YarnResponse
			yarn: string
			plating: string | null
			page: string
			lines: boolean
			quiet: string
			rose: string
			picked: number
			flipped: boolean
	  }
	| {type: "picked"; id: number; picked: number}
	| {type: "flip"; id: number; flipped: boolean}
	| {type: "pointer"; id: number; kind: "pointerdown" | "pointermove" | "pointerup"; clientX: number; clientY: number; button: number; shiftKey: boolean}
	| {type: "wheel"; id: number; x: number; y: number; deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean}
	| {type: "pick"; id: number; x: number; y: number}

export type FromRender = {type: "picked"; id: number; block: number}

// once a frame, at most (a worker's own animation frames where it has them)
const nextFrame: (run: () => void) => unknown =
	typeof requestAnimationFrame === "function" ? requestAnimationFrame : run => setTimeout(run, 16)

interface Surface {
	size(width: number, height: number, ratio: number): void
	take(message: ToRender): void
	close(): void
}

// ── the stitches view: a picture, painted as the page has the view

function stitchesSurface(canvas: OffscreenCanvas): Surface {
	const context = canvas.getContext("2d")!
	let picture: Picture | null = null
	let view: View | null = null
	let picked = -1
	let size = {width: 0, height: 0}
	let waiting = false
	function paint() {
		waiting = false
		if (!picture || !view || !size.width) {
			context.setTransform(1, 0, 0, 1, 0, 0)
			context.clearRect(0, 0, canvas.width, canvas.height)
			return
		}
		picture.paint(context, view, size, picture.bands[picked] ?? null)
	}
	const soon = () => {
		if (!waiting) (waiting = true), nextFrame(paint)
	}
	return {
		size(width, height, ratio) {
			size = {width, height}
			canvas.width = Math.round(width * ratio)
			canvas.height = Math.round(height * ratio)
			soon()
		},
		take(message) {
			if (message.type === "stitches") picture = stitchesPicture(message.blocks, message.width, message.height, message.colours)
			else if (message.type === "view") ({view, picked} = message)
			soon()
		},
		close() {},
	}
}

// ── the chart

function chartSurface(canvas: OffscreenCanvas): Surface {
	let ratio = 1
	return {
		size(_width, _height, pixelRatio) {
			ratio = pixelRatio
		},
		take(message) {
			if (message.type !== "chart") return
			drawChart(canvas, message.stitches, message.width, message.height, message.cell, message.colours, ratio, message.flipped)
		},
		close() {},
	}
}

// ── knitscape's yarn

type YarnData = {yarnIndex: string; pts: Float32Array; diameter: number; color: number[]}
const unit = (colour: string) => rgbOf(colour).map(value => value / 255)

// a yarn's points as the renderer wants them: the pieces between any the
// worker left out (not numbers), each long enough to draw. (two strands in
// a loop, plated: each thinner)
function yarnDataOf(response: YarnResponse, yarn: string, plating: string | null): YarnData[] {
	const colours = {yarn: unit(yarn), plating: unit(plating ?? yarn)}
	const plated = response.yarns.some(y => y.plating)
	const diameter = plated ? response.diameter * 0.62 : response.diameter
	const data: YarnData[] = []
	for (const {yarn: n, points, plating: back} of response.yarns) {
		let piece: number[] = []
		const done = () => {
			if (piece.length >= 12)
				data.push({yarnIndex: `${n}.${data.length}`, pts: new Float32Array(piece), diameter, color: back ? colours.plating : colours.yarn})
			piece = []
		}
		for (let i = 0; i < points.length; i += 3) {
			const x = points[i]
			const y = points[i + 1]
			const z = points[i + 2]
			if (!Number.isFinite(x + y + z)) {
				done()
				continue
			}
			piece.push(x, y, z)
		}
		done()
	}
	return data
}

// each block's line: a thin tube straight down its side, a little off the
// scarf, on its left as it's seen (from the back, that's its right)
const BAR = {gap: 1.2, diameter: 0.32, inset: 0.4}
function barsOf(response: YarnResponse, fromBehind: boolean, colour: number[]): YarnData[] {
	const x = fromBehind ? response.bounds.maxX + BAR.gap : response.bounds.minX - BAR.gap
	return response.bands.map((band, n) => {
		const pts: number[] = []
		const bottom = band.minY + BAR.inset
		const top = band.maxY - BAR.inset
		for (let k = 0; k < 8; k++) pts.push(x, bottom + ((top - bottom) * k) / 7, 0)
		return {yarnIndex: `block ${n}`, pts: new Float32Array(pts), diameter: BAR.diameter, color: colour}
	})
}

// a yarn's fibres, and the shade they cast, from where a stitch is this many
// pixels across: further out, they're more than a pixel can show
const FIBRES_FROM = 16

function knitscapeSurface(id: number, canvas: OffscreenCanvas): Surface {
	const sized = canvas as OffscreenCanvas & {clientWidth: number; clientHeight: number}
	sized.clientWidth = 0
	sized.clientHeight = 0
	const renderer = createNoodleRenderer()
	let ready = false
	let shown: YarnResponse | null = null
	let data: YarnData[] = []
	let firstBar = 0
	let barCount = 0
	let behind = false
	let flipped = false
	let picked = -1
	let colours = {quiet: [0.9, 0.85, 0.85], rose: [0.78, 0.2, 0.42]}
	let fibres: boolean | null = null
	let open = true

	function colourBars() {
		for (let n = 0; n < barCount; n++) renderer.setYarnColor(firstBar + n, n === picked ? colours.rose : colours.quiet)
	}

	// fibres or not: how big a stitch is on the canvas, now
	function detail() {
		const camera = renderer.camera
		if (!camera) return
		const stitch = sized.clientHeight / (2 * camera.distance * Math.tan(camera.fov / 2))
		const wanted = stitch >= FIBRES_FROM
		if (wanted === fibres) return
		fibres = wanted
		renderer.setFiberMode(wanted)
		renderer.setAmbientOcclusion({enabled: wanted})
	}

	// the lines on the scarf's left as the camera sees it: moved, not drawn
	// again, when the camera goes round to the other side
	function sideLines() {
		const camera = renderer.camera
		if (!camera || !shown || !barCount) return
		const fromBehind = Math.cos(camera.azimuth) < 0
		if (fromBehind === behind) return
		behind = fromBehind
		data = [...data.slice(0, firstBar), ...barsOf(shown, behind, colours.quiet)]
		renderer.updateYarnGeometry(data)
		colourBars()
	}

	function tick() {
		if (!open) return
		if (ready && sized.clientWidth) {
			detail()
			sideLines()
			renderer.draw()
		}
		nextFrame(tick)
	}
	nextFrame(tick)

	// which block's under a point of the canvas: where its ray meets the
	// fabric (z = 0), and which block's that height
	function blockAt(x: number, y: number) {
		const camera = renderer.camera
		if (!camera || !shown || !sized.clientWidth) return -1
		const ndcX = (x / sized.clientWidth) * 2 - 1
		const ndcY = 1 - (y / sized.clientHeight) * 2
		const {origin, direction} = camera.rayAt(ndcX, ndcY, sized.clientWidth / sized.clientHeight)
		if (Math.abs(direction[2]) < 1e-6) return -1
		const along = -origin[2] / direction[2]
		if (along < 0) return -1
		const height = origin[1] + direction[1] * along
		return shown.bands.findIndex(band => height >= band.minY - 0.5 && height <= band.maxY + 0.5)
	}

	return {
		size(width, height, ratio) {
			sized.clientWidth = width
			sized.clientHeight = height
			scope.devicePixelRatio = ratio
		},
		take(message) {
			if (message.type === "yarn") {
				const {response} = message
				colours = {quiet: unit(message.quiet), rose: unit(message.rose)}
				picked = message.picked
				// (new yarn's seen whole again; a new colour, as it was)
				const refit = !ready || response.stitches !== shown?.stitches
				if (refit) behind = false
				const yarns = yarnDataOf(response, message.yarn, message.plating)
				const bars = message.lines ? barsOf(response, behind, colours.quiet) : []
				firstBar = yarns.length
				barCount = bars.length
				data = [...yarns, ...bars]
				renderer.init(data, canvas, refit)
				renderer.setBackground(unit(message.page))
				colourBars()
				// (it starts from the front: flipped, it's turned round)
				if (refit && message.flipped) renderer.camera?.turnAround()
				flipped = message.flipped
				shown = response
				ready = true
			} else if (message.type === "picked") {
				picked = message.picked
				if (ready) colourBars()
			} else if (message.type === "flip") {
				if (!ready || message.flipped === flipped) return
				flipped = message.flipped
				renderer.camera?.turnAround()
			} else if (message.type === "pointer") {
				// (to the camera, as the page's own events would come: a press on
				// the canvas, the moves and the letting go on the window)
				const event = Object.assign(new Event(message.kind, {cancelable: true}), {
					clientX: message.clientX,
					clientY: message.clientY,
					button: message.button,
					shiftKey: message.shiftKey,
				})
				if (message.kind === "pointerdown") canvas.dispatchEvent(event)
				else self.dispatchEvent(event)
			} else if (message.type === "wheel") {
				// scroll moves it (a right-drag's way); pinch (and ⌘-scroll) zoom,
				// towards where the pointer is
				const camera = renderer.camera
				if (!camera) return
				if (!message.ctrlKey && !message.metaKey) return camera.pan(-message.deltaX, -message.deltaY)
				const factor = Math.exp(message.deltaY * (message.ctrlKey ? 0.01 : 0.0025))
				const ndcX = (message.x / sized.clientWidth) * 2 - 1
				const ndcY = 1 - (message.y / sized.clientHeight) * 2
				const {origin, direction} = camera.rayAt(ndcX, ndcY, sized.clientWidth / sized.clientHeight)
				const along = Math.abs(direction[2]) > 1e-6 ? -origin[2] / direction[2] : -1
				const toward = along > 0 ? origin.map((value: number, i: number) => value + direction[i] * along) : undefined
				camera.zoom(factor, toward)
			} else if (message.type === "pick") {
				const block = blockAt(message.x, message.y)
				if (block >= 0) self.postMessage({type: "picked", id, block} satisfies FromRender)
			}
		},
		close() {
			open = false
			renderer.destroy()
		},
	}
}

// ── the canvases

const surfaces = new Map<number, Surface>()

self.onmessage = (event: MessageEvent<ToRender>) => {
	const message = event.data
	if (message.type === "open") {
		const make = message.kind === "stitches" ? stitchesSurface : message.kind === "chart" ? chartSurface : null
		surfaces.set(message.id, make ? make(message.canvas) : knitscapeSurface(message.id, message.canvas))
		return
	}
	const surface = surfaces.get(message.id)
	if (!surface) return
	if (message.type === "size") surface.size(message.width, message.height, message.ratio)
	else if (message.type === "close") {
		surface.close()
		surfaces.delete(message.id)
	} else surface.take(message)
}
