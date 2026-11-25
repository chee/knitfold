import {NAMES} from "./stitches.ts"
import {HELPER_DECLARATIONS} from "./helpers.ts"

// what a block's code can see, as typescript declarations: so the file
// tool's language server, hovering or completing a name, says what it is
// (and isn't left saying `any`). written into the server's files, beside
// the block's .js (code-pane.tsx)

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

// doc() and get() (given.ts): the general ones, after each thing got's own
// (overloadsOf), so a url that's been got says what's there
const DOC = `/** an automerge doc's value, by its url (\`automerge:…\`). no await: it's waited
 * for (the block's knitted plain till it's here), and the blocks run again
 * as it changes */`
const GET = `/** what's at a url. as: "bytes" (a Uint8Array), "text", "json", or "clever"
 * (the default: what its type says it is. json's json, csv's rows of cells,
 * an image a Picture, a sound a Sound, other text text, anything else its
 * bytes). no await:
 * it's waited for (the block's knitted plain till it's here) */`

const PICTURE = `/** an image's pixels. x and y are the image's own: 0, 0 at its top left
 * (past its edges, it's its edges) */
interface Picture {
	readonly width: number
	readonly height: number
	/** red, green, blue, alpha, each 0–255, row by row from the top */
	readonly data: Uint8ClampedArray
	/** [red, green, blue, alpha] at x, y, each 0–255 */
	at(x: number, y: number): [number, number, number, number]
	/** how light it is at x, y: 0 black to 1 white (see-through's white) */
	light(x: number, y: number): number
}`

const SOUND = `/** a sound's samples, one channel. a spectrogram's a power for each moment
 * and pitch: \`sound.power(seconds, hz)\` */
interface Sound {
	readonly sampleRate: number
	/** -1 to 1, sampleRate of them a second */
	readonly samples: Float32Array
	/** how long it is, in seconds */
	readonly duration: number
	/** the sample at a moment, in seconds: -1 to 1 */
	at(seconds: number): number
	/** how loud hz is around a moment (in seconds): 0 to 1, a sine that fills
	 * the sound's 1. heard over window samples (1024 if it's left off: more
	 * hears pitches apart better, fewer moments) */
	power(seconds: number, hz: number, window?: number): number
}`

// doc() and get(), with what's been got
function fetching(overloads: {doc: string[]; get: string[]}) {
	return [
		PICTURE,
		SOUND,
		"",
		...overloads.doc.flatMap(line => [DOC, line]),
		DOC,
		"declare function doc(url: string): any",
		"",
		...overloads.get.flatMap(line => [GET, line]),
		GET,
		`declare function get(url: string, as: "bytes"): Uint8Array`,
		GET,
		`declare function get(url: string, as: "text"): string`,
		GET,
		`declare function get(url: string, as: "json"): any`,
		GET,
		`declare function get(url: string, as?: "clever"): any`,
		"",
	]
}

export function declarationsWith(overloads: {doc: string[]; get: string[]} = {doc: [], get: []}) {
	return [DECLARATIONS, HELPER_DECLARATIONS, "", ...fetching(overloads)].join("\n")
}

// a knitout.js block's (knitout-block.ts): the knitout writer, k (one,
// already made), the scarf's needles and its carrier, and doc() and get()
const KNITOUT_DECLARATIONS = `// knitfold: what a knitout.js block's code can see

/** a needle: "f12", "b3" (or "fs12", "bs3", the sliders) */
type Needle = string | [string, number] | {bed: string; needle: number}
type Direction = "+" | "-"

/** knitout.js's writer: each call's an op in the .k */
interface KnitoutWriter {
	/** a carrier in (no need for the main carrier: it's in) */
	in(...carriers: string[]): void
	/** a carrier out (not the main carrier: the scarf goes on after) */
	out(...carriers: string[]): void
	inhook(...carriers: string[]): void
	releasehook(...carriers: string[]): void
	outhook(...carriers: string[]): void
	/** a stitch on needle, made with carriers, going direction */
	knit(direction: Direction, needle: Needle, ...carriers: string[]): void
	/** a tuck: a loop held, not knitted through */
	tuck(direction: Direction, needle: Needle, ...carriers: string[]): void
	/** the carriers past needle, no loop made */
	miss(direction: Direction, needle: Needle, ...carriers: string[]): void
	/** the loop at from moved to to (the other bed) */
	xfer(from: Needle, to: Needle): void
	split(direction: Direction, from: Needle, to: Needle, ...carriers: string[]): void
	drop(needle: Needle): void
	/** the back bed moved, this many needles (0 is lined up) */
	rack(racking: number): void
	stitch(before: number, after: number): void
	stitchNumber(number: number): void
	speedNumber(number: number): void
	rollerAdvance(number: number): void
	addRollerAdvance(number: number): void
	fabricPresser(mode: string): void
	carrierSpacing(spacing: number): void
	carrierStoppingDistance(distance: number): void
	pause(comment?: string): void
	comment(text: string): void
	addHeader(name: string, value: string): void
	addRawOperation(operation: string): void
	/** which side the carrier's on: "L", "R", or null if it hasn't moved */
	getCarrierPosition(carrier: string): "L" | "R" | null
	write(filename?: string): string
}

/** knitout.js: require("knitout") (or import it) for a writer of your own */
declare function require(name: "knitout"): {Writer: new (options: {carriers: string[]}) => KnitoutWriter}

/** a knitout.Writer for the kniterate (carriers 1 to 6), carrier already
 * in. what it writes goes into the scarf's .k as it is, starting from
 * wherever what came before left everything (home() first, to start home) */
declare const k: KnitoutWriter
/** the needle the scarf's first column is on */
declare const min_needle: number
/** the needle the scarf's last column is on */
declare const max_needle: number
/** the scarf's yarn's carrier (in, all the way through the scarf) */
declare const carrier: string
/** the scarf's yarn's carrier: carrier, by another name */
declare const main_carrier: string
/** transfer all to the front bed, at racking 0, with the carrier to the
 * left: from wherever they are (where what came before left them, and then
 * k). nothing, if they're there already */
declare function home(): void
`

export function knitoutDeclarationsWith(overloads: {doc: string[]; get: string[]} = {doc: [], get: []}) {
	return [KNITOUT_DECLARATIONS, ...fetching(overloads)].join("\n")
}

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

/** where they are in the language server's files (rooted at /, beside each
 * open document's folder) */
export const DECLARATIONS_PATH = "/knitfold/knitfold.d.ts"
