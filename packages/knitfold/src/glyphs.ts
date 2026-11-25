import {Stitch} from "./stitches.ts"
import {matrixOf, mix, rgbOf, type Band, type Bounds, type Context2D, type Picture, type View} from "./view.ts"

// the scarf, stitch by stitch, as lattice's animation draws its fabric: a
// knit's a V (its two legs, down into the loop below), a purl's a bump (the
// head of a loop on the far side, a little deeper, as it's further in). from
// the stitches themselves, not a simulation, so it's the same at any size;
// further out than a few pixels a stitch, each's a square of its colour.
// plated, the knits are the yarn and the purls what it's plated with; seen
// from the back, the other way round

// a stitch is 1 wide and ROW tall (as the animation's are: 10 by 7)
export const ROW = 0.7
// a yarn's this wide
const STRAND = 0.21
// a purl's the far side's: this much of the way to the ink
const DEEPER = 0.1
// (closer than this many pixels a stitch, it's drawn as stitches)
const GLYPHS_FROM = 5

// a purl's colour, wherever a purl's drawn (the scarf's bumps, the chart's
// cells): what it's plated with (or the yarn), DEEPER of the way to the ink
export const purlColour = (plating: string, ink: string) => mix(rgbOf(plating), rgbOf(ink), DEEPER)

export interface StitchColours {
	yarn: string
	plating: string | null
	page: string
	ink: string
	wash: string
}

/** the waste section, under the first block: its rows, read back from its
 * knitout, and which of them are the waste yarn's (or the draw thread's) */
export interface WasteRows {
	height: number
	/** width × height of them */
	stitches: Uint8Array
	/** for each row: 1 the waste yarn (or the draw thread), 0 the scarf's */
	waste: Uint8Array
	colour: string
}

// where the scarf's stitches are, in its units: what the page needs to
// place it and pick its blocks (the worker draws it). each block's as many
// rows as it has (a knitout.js block's are its own). a waste section's
// `below` rows are under the first block, below 0: not a block's
export function stitchesLayout(heights: number[], width: number, below = 0): {bounds: Bounds; bands: Band[]} {
	const bands: Band[] = []
	let rows = 0
	for (const height of heights) {
		bands.push({minY: rows * ROW, maxY: (rows + height) * ROW})
		rows += height
	}
	return {bounds: {minX: 0, maxX: width, minY: -below * ROW, maxY: rows * ROW}, bands}
}

interface Strokes {
	knits: Path2D
	purls: Path2D
	knitCells: Path2D
	purlCells: Path2D
}
const strokes = (): Strokes => ({knits: new Path2D(), purls: new Path2D(), knitCells: new Path2D(), purlCells: new Path2D()})

export function stitchesPicture(blocks: Uint8Array[], width: number, heights: number[], colours: StitchColours, waste?: WasteRows | null): Picture {
	const {bounds, bands} = stitchesLayout(heights, width, waste?.height ?? 0)
	// each side's stitches, made when it's first shown: [front, back], each
	// the scarf's yarn's and the waste yarn's
	const made: {yarn: Strokes; waste: Strokes}[] = []

	// a stitch at x, on row (from the first block's first, up)
	function stitchAt(into: Strokes, x: number, row: number, stitch: number, back: boolean) {
		// (a needle a knitout.js block's row didn't knit: nothing there)
		if (stitch === Stitch.NONE) return
		const cx = x + 0.5
		const cy = row * ROW + ROW / 2
		// (from the back, the front bed's loops are the far ones)
		if ((stitch === Stitch.BACK) === back) {
			into.knits.moveTo(cx - 0.36, cy + 0.36)
			into.knits.lineTo(cx - 0.05, cy - 0.33)
			into.knits.moveTo(cx + 0.36, cy + 0.36)
			into.knits.lineTo(cx + 0.05, cy - 0.33)
			// (a hair over, so squares side by side don't leave a seam)
			into.knitCells.rect(x - 0.01, row * ROW - 0.01, 1.02, ROW + 0.02)
		} else {
			into.purls.moveTo(cx - 0.38, cy - 0.18)
			into.purls.quadraticCurveTo(cx, cy + 0.44, cx + 0.38, cy - 0.18)
			into.purlCells.rect(x - 0.01, row * ROW - 0.01, 1.02, ROW + 0.02)
		}
	}

	function sideOf(back: boolean) {
		const index = back ? 1 : 0
		if (made[index]) return made[index]
		const side = {yarn: strokes(), waste: strokes()}
		if (waste) {
			for (let y = 0; y < waste.height; y++) {
				const into = waste.waste[y] ? side.waste : side.yarn
				for (let x = 0; x < width; x++) stitchAt(into, x, y - waste.height, waste.stitches[x + y * width], back)
			}
		}
		let first = 0
		blocks.forEach((stitches, b) => {
			const height = heights[b]
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) stitchAt(side.yarn, x, first + y, stitches[x + y * width], back)
			}
			first += height
		})
		return (made[index] = side)
	}

	function draw(context: Context2D, into: Strokes, near: string, far: string, glyphs: boolean) {
		if (!glyphs) {
			context.fillStyle = far
			context.fill(into.purlCells)
			context.fillStyle = near
			context.fill(into.knitCells)
		} else {
			context.lineCap = "round"
			context.lineJoin = "round"
			context.lineWidth = STRAND
			context.strokeStyle = far
			context.stroke(into.purls)
			context.strokeStyle = near
			context.stroke(into.knits)
		}
	}

	return {
		bounds,
		bands,
		paint(context: Context2D, view: View, size: {width: number; height: number}, picked: Band | null) {
			const ratio = context.canvas.width / size.width
			context.setTransform(1, 0, 0, 1, 0, 0)
			context.fillStyle = colours.page
			context.fillRect(0, 0, context.canvas.width, context.canvas.height)
			const {a, b, c, d} = matrixOf(view)
			context.setTransform(a * ratio, b * ratio, c * ratio, d * ratio, view.x * ratio, view.y * ratio)
			if (picked) {
				context.fillStyle = colours.wash
				context.fillRect(-0.6, picked.minY - 0.3, width + 1.2, picked.maxY - picked.minY + 0.6)
			}
			const side = sideOf(view.flipped)
			const glyphs = view.scale >= GLYPHS_FROM
			// (plated: the near loops show the yarn, the far ones the plating)
			draw(context, side.yarn, colours.yarn, purlColour(colours.plating ?? colours.yarn, colours.ink), glyphs)
			// (the waste yarn's one yarn)
			if (waste) draw(context, side.waste, waste.colour, purlColour(waste.colour, colours.ink), glyphs)
			context.setTransform(1, 0, 0, 1, 0, 0)
		},
	}
}
