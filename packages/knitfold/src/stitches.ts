// what a block's code says about each stitch: a technique (0 back, 1 front,
// then the patterns: 2 garter, 3 seed, 4 1×1 rib, 5 2×2 rib, 6 1×2 rib; so
// a bit's a bed, and `x % 2` is a rib), which the stitch's place makes into
// what the machine does with that needle on that row: knit it on the front
// bed or the back. every technique's a fabric of knits and purls

import {withCompletion} from "./completion.ts"
import {ONCE, withConstants} from "./constants.ts"
import {HELPERS} from "./helpers.ts"

export const Technique = {
	/** knit on the back bed: reverse stockinette, a purl from the front */
	BACK: 0,
	/** knit on the front bed: stockinette's right side */
	FRONT: 1,
	/** a row front, a row back */
	GARTER: 2,
	/** front and back by turns, along the row and up it */
	SEED: 3,
	/** 1×1 rib: a needle front, a needle back */
	RIB: 4,
	/** 2×2 rib */
	RIB2: 5,
	/** 1×2 rib: a needle front, two back */
	RIB3: 6,
} as const

export type TechniqueName = keyof typeof Technique
export const TECHNIQUES = Object.keys(Technique) as TechniqueName[]

// what a block's code calls them: short, as they'd be written on a chart.
// f front and b back (the two beds), g garter, s seed, r rib (1×1, as r1
// is, for now), r1 r2 r3 the ribs (1×1, 2×2, 1×2)
export const NAMES = {
	b: Technique.BACK,
	f: Technique.FRONT,
	g: Technique.GARTER,
	s: Technique.SEED,
	r: Technique.RIB,
	r1: Technique.RIB,
	r2: Technique.RIB2,
	r3: Technique.RIB3,
} as const
export type Name = keyof typeof NAMES

/** what the machine does with a needle, a row: knits it on the front bed
 * (a knit, from the front) or the back (a purl) */
export const Stitch = {
	FRONT: 0,
	BACK: 1,
} as const
export type StitchKind = (typeof Stitch)[keyof typeof Stitch]

// a technique, where it is, as a stitch (the parities are blob's)
export function stitchOf(technique: number, x: number, y: number): StitchKind {
	const {FRONT, BACK} = Stitch
	switch (technique) {
		case Technique.FRONT:
			return FRONT
		case Technique.GARTER:
			return y % 2 === 0 ? FRONT : BACK
		case Technique.SEED:
			return (x + y) % 2 === 0 ? FRONT : BACK
		case Technique.RIB:
			return x % 2 === 0 ? FRONT : BACK
		case Technique.RIB2:
			return Math.floor(x / 2) % 2 === 0 ? FRONT : BACK
		case Technique.RIB3:
			return x % 3 === 0 ? FRONT : BACK
		default:
			return BACK
	}
}

// whatever the code gave back, as a technique: a number's that technique,
// true's 1 (front) and false 0 (back), as they are as numbers; nothing, or
// anything else, is plain (front)
export function techniqueOf(value: unknown): number {
	if (value === true) return Technique.FRONT
	if (value === false) return Technique.BACK
	if (typeof value === "string") {
		const named = NAMES[value as Name] ?? Technique[value.toUpperCase() as TechniqueName]
		return named ?? Technique.FRONT
	}
	if (typeof value !== "number" || !Number.isFinite(value)) return Technique.FRONT
	const n = Math.round(value)
	return n >= 0 && n <= Technique.RIB3 ? n : Technique.FRONT
}

export type BlockFunction = (
	x: number,
	y: number,
	i: number,
	w: number,
	h: number,
	t: number,
) => unknown

// a block's code, tixy's way: an expression (`x % 2 ? r : f`) or a function
// body, every statement of which is an expression (completion.ts): it's
// the last thing it does. it's run with Math and the techniques' names in scope
// (and their old capitals, FRONT and so on, for blocks written with them).
// col and row are x and y by other names
export function compile(code: string, globals: Record<string, unknown> = {}): BlockFunction {
	// (a top-level const is once, constants.ts: what each gives back the first
	// time, kept for every stitch after. a run's own, each block's)
	const kept = new Map<number, unknown>()
	const once = (n: number, make: () => unknown) => {
		if (!kept.has(n)) kept.set(n, make())
		return kept.get(n)
	}
	const scope = {...Object.fromEntries(TECHNIQUES.map(name => [name, Technique[name]])), ...NAMES, ...HELPERS, [ONCE]: once, ...globals}
	const wrap = (body: string) =>
		new Function(
			"scope",
			`with (Math) { with (scope) { return function block(x, y, i, w, h, t, col = x, row = y) {\n${body}\n} } }`,
		)(scope) as BlockFunction
	const trimmed = code.trim()
	if (!trimmed) return () => Technique.FRONT
	try {
		// (an expression: its value's the stitch)
		// (its functions' last values given back too)
		return wrap(`return (${withCompletion(trimmed, {top: false}).replace(/;\s*$/, "")}\n)`)
	} catch {
		return wrap(withCompletion(withConstants(code)))
	}
}

export interface Grid {
	width: number
	height: number
	/** a technique for each stitch, row by row from the first knitted */
	techniques: Uint8Array
	/** and what the machine does there */
	stitches: Uint8Array
}

export class BlockError extends Error {
	x: number
	y: number
	constructor(message: string, x: number, y: number, options?: ErrorOptions) {
		super(message, options)
		this.x = x
		this.y = y
	}
}

// the block, run for every stitch. y's 0 at the first row knitted (the
// bottom of the block, as it hangs off the needles). t's the time, in
// seconds, as tixy's is: just for fun, as a block's chart is drawn (what's
// knitted is what it is at 0)
export function gridOf(fn: BlockFunction, width: number, height: number, time = 0): Grid {
	const techniques = new Uint8Array(width * height)
	const stitches = new Uint8Array(width * height)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = x + y * width
			let value: unknown
			try {
				value = fn(x, y, i, width, height, time)
			} catch (cause) {
				const message = cause instanceof Error ? cause.message : String(cause)
				throw new BlockError(`${message} (at x ${x}, y ${y})`, x, y, {cause})
			}
			const technique = techniqueOf(value)
			techniques[i] = technique
			stitches[i] = stitchOf(technique, x, y)
		}
	}
	return {width, height, techniques, stitches}
}
