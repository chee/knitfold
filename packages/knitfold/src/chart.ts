import {Stitch} from "./stitches.ts"
import {ROW} from "./glyphs.ts"
import {mix, rgbOf} from "./view.ts"

// a block as a chart: a plain grid of cells, a cell a stitch (as wide as
// it is and ROW as tall, as the scarf's stitches are), the first
// row knitted at the bottom, as a stoll or a kniterate chart has them but
// simpler (and no grid over it). each cell's the colour of the yarn you'd
// see there: a knit's face is the yarn, a purl's what it's plated with (or
// the yarn again), a little deeper, as a purl sits a little lower. no marks.
// flipped, it's the back: mirrored, and its knits are purls and its purls
// knits

export interface ChartColours {
	page: string
	ink: string
	grid: string
	/** the yarn, and what it's plated with (or the yarn again) */
	face: string
	back: string
}

// (on the page or, as knitfold draws it, in a worker: its canvas's css
// size is the page's to set, cell × width by cell × ROW × height)
export function drawChart(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	stitches: Uint8Array,
	width: number,
	height: number,
	cell: number,
	colours: ChartColours,
	pixelRatio = 1,
	flipped = false,
) {
	const ratio = Math.max(1, pixelRatio)
	canvas.width = Math.round(width * cell * ratio)
	canvas.height = Math.round(height * cell * ROW * ratio)
	const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
	const c = cell * ratio
	const r = cell * ROW * ratio
	const W = canvas.width
	const H = canvas.height
	context.clearRect(0, 0, W, H)

	// the cells: filled by the yarn that shows
	const faces = new Path2D()
	const backs = new Path2D()
	// (from the back: the columns the other way, and a loop on the front bed
	// is a purl, one on the back bed a knit)
	const near = flipped ? Stitch.BACK : Stitch.FRONT
	const column = (x: number) => (flipped ? width - 1 - x : x)
	for (let y = 0; y < height; y++) {
		const top = H - (y + 1) * r
		for (let x = 0; x < width; x++) {
			const into = stitches[x + y * width] === near ? faces : backs
			into.rect(column(x) * c, top, c, r)
		}
	}
	context.fillStyle = colours.face
	context.fill(faces)
	context.fillStyle = mix(rgbOf(colours.back), rgbOf(colours.ink), 0.2)
	context.fill(backs)
}
