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

// where the scarf's stitches are, in its units: what the page needs to
// place it and pick its blocks (the worker draws it)
export function stitchesLayout(count: number, width: number, height: number): {bounds: Bounds; bands: Band[]} {
	return {
		bounds: {minX: 0, maxX: width, minY: 0, maxY: count * height * ROW},
		bands: Array.from({length: count}, (_, b) => ({minY: b * height * ROW, maxY: (b + 1) * height * ROW})),
	}
}

export function stitchesPicture(blocks: Uint8Array[], width: number, height: number, colours: StitchColours): Picture {
	const rows = blocks.length * height
	// each side's stitches, made when it's first shown: [front, back]
	const made: {knits: Path2D; purls: Path2D; knitCells: Path2D; purlCells: Path2D}[] = []

	function sideOf(back: boolean) {
		const index = back ? 1 : 0
		if (made[index]) return made[index]
		const knits = new Path2D()
		const purls = new Path2D()
		const knitCells = new Path2D()
		const purlCells = new Path2D()
		blocks.forEach((stitches, b) => {
			for (let y = 0; y < height; y++) {
				const row = b * height + y
				const cy = row * ROW + ROW / 2
				for (let x = 0; x < width; x++) {
					const stitch = stitches[x + y * width]
					const cx = x + 0.5
					// (from the back, the front bed's loops are the far ones)
					if ((stitch === Stitch.BACK) === back) {
						knits.moveTo(cx - 0.36, cy + 0.36)
						knits.lineTo(cx - 0.05, cy - 0.33)
						knits.moveTo(cx + 0.36, cy + 0.36)
						knits.lineTo(cx + 0.05, cy - 0.33)
						// (a hair over, so squares side by side don't leave a seam)
						knitCells.rect(x - 0.01, row * ROW - 0.01, 1.02, ROW + 0.02)
					} else {
						purls.moveTo(cx - 0.38, cy - 0.18)
						purls.quadraticCurveTo(cx, cy + 0.44, cx + 0.38, cy - 0.18)
						purlCells.rect(x - 0.01, row * ROW - 0.01, 1.02, ROW + 0.02)
					}
				}
			}
		})
		return (made[index] = {knits, purls, knitCells, purlCells})
	}

	return {
		bounds: {minX: 0, maxX: width, minY: 0, maxY: rows * ROW},
		bands: blocks.map((_, b) => ({minY: b * height * ROW, maxY: (b + 1) * height * ROW})),
		paint(context: Context2D, view: View, size: {width: number; height: number}, picked: Band | null) {
			const ratio = context.canvas.width / size.width
			const yarn = rgbOf(colours.yarn)
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
			// (plated: the near loops show the yarn, the far ones the plating)
			const near = `rgb(${yarn.join(" ")})`
			const far = purlColour(colours.plating ?? colours.yarn, colours.ink)
			if (view.scale < GLYPHS_FROM) {
				context.fillStyle = far
				context.fill(side.purlCells)
				context.fillStyle = near
				context.fill(side.knitCells)
			} else {
				context.lineCap = "round"
				context.lineJoin = "round"
				context.lineWidth = STRAND
				context.strokeStyle = far
				context.stroke(side.purls)
				context.strokeStyle = near
				context.stroke(side.knits)
			}
			context.setTransform(1, 0, 0, 1, 0, 0)
		},
	}
}
