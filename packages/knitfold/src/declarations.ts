import {NAMES} from "./stitches.ts"

// what a block's code can see, as typescript declarations: so the file
// tool's language server, hovering or completing a name, says what it is
// (and isn't left saying `any`). opened in the server beside the block's
// .js (code-pane.tsx)

const STITCH_DOCS: Record<keyof typeof NAMES, string> = {
	f: "front: knit on the front bed. stockinette, from the front",
	b: "back: knit on the back bed. a purl, from the front",
	g: "garter: a row on the front bed, a row on the back, by turns",
	s: "seed: front and back by turns, along each row and up the rows",
	r: "rib: 1×1, a needle on the front bed, a needle on the back (as r1 is, for now)",
	r1: "1×1 rib: a needle on the front bed, a needle on the back",
	r2: "2×2 rib: two needles on the front bed, two on the back",
	r3: "1×2 rib: a needle on the front bed, two on the back",
}

const VARIABLES = [
	["x", "number", "the stitch's column: 0 at the left, to w − 1"],
	["y", "number", "the stitch's row: 0 is the block's first row knitted (its bottom), to h − 1"],
	["col", "number", "the stitch's column: x, by another name"],
	["row", "number", "the stitch's row: y, by another name"],
	["i", "number", "the stitch's index in the block: x + y × w"],
	["w", "number", "the block's width, in stitches"],
	["h", "number", "the block's height, in rows"],
	["t", "number", "the time, in seconds, as tixy's is: the chart moves with it. what's knitted is the block at t = 0"],
] as const

// Math's own, in scope without `Math.` (a block's code runs `with (Math)`)
const MATH = Object.getOwnPropertyNames(Math)

export const DECLARATIONS = [
	"// knitfold: what a block's code can see",
	"",
	...VARIABLES.flatMap(([name, type, doc]) => [`/** ${doc} */`, `declare const ${name}: ${type}`]),
	"",
	...Object.entries(NAMES).flatMap(([name, value]) => [
		`/** ${STITCH_DOCS[name as keyof typeof NAMES]} (${value}) */`,
		`declare const ${name}: ${value}`,
	]),
	"",
	...MATH.map(name => `declare const ${name}: typeof Math.${name}`),
	"",
].join("\n")

export const DECLARATIONS_URI = "file:///knitfold/knitfold.d.ts"
