import {evalJS} from "./vendor/knitout/evalJS.js"
import {Loops, type LoopsState} from "./loops.ts"
import {Stitch} from "./stitches.ts"

// a knitout.js block: code as lattice's patterns are (a knitout.Writer's
// ops), not a stitch for each x and y. it's given what it needs to knit its
// part of the scarf, already made:
//
//   k             a knitout.Writer for the kniterate (carriers 1 to 6), its
//                 main carrier already in: the scarf's yarn's still in
//   min_needle    the needle the scarf's first column is on
//   max_needle    the last's
//   carrier       the scarf's yarn's carrier (main_carrier, too)
//   home()        every loop to the front bed, at racking 0, and the
//                 carrier to the left (loops.ts), from wherever they are:
//                 where what came before left them, and then k
//
// (and doc() and get(), as a knitfold block has them, or imported from
// "lattice", as a lattice pattern has them.) it starts from wherever what
// came before it left everything: a home() first, if it wants them home.
// it knits as many rows as it likes. what it writes goes into
// the scarf's .k as it is, but for its headers and the main carrier going
// in or out (it's in for the whole scarf)

/** the kniterate's carriers */
export const CARRIERS = ["1", "2", "3", "4", "5", "6"]

export interface KnitoutBlockOptions {
	minNeedle: number
	maxNeedle: number
	carrier: string
	/** where the loops, the carrier and the racking are as it starts (home,
	 * if it's not said) */
	start?: LoopsState
	/** more for it to see: doc() and get() */
	globals?: Record<string, unknown>
}

export interface KnitoutBlockResult {
	/** its ops (and comments), as they'll be in the scarf's .k */
	ops: string[]
	error: {message: string; line: number | null} | null
}

// `import … from "knitout"` (or "lattice") isn't anything in a function's
// body: each is said as a const instead, on the line it was on
export function withRequires(code: string) {
	const binding = (what: string) => {
		const star = what.match(/^\*\s+as\s+([\w$]+)$/)
		if (star) return star[1]
		return what.replace(/\b([\w$]+)\s+as\s+([\w$]+)/g, "$1: $2")
	}
	return code
		.replace(/^([ \t]*)import\s+([^;\n]+?)\s+from\s+(["'])knitout\3;?/gm, (_, indent, what) => `${indent}const ${binding(what.trim())} = require("knitout");`)
		.replace(/^([ \t]*)import\s+([^;\n]+?)\s+from\s+(["'])lattice\3;?/gm, (_, indent, what) => `${indent}const ${binding(what.trim())} = __lattice;`)
}

const CARRIER_OPS = new Set(["in", "out", "inhook", "outhook", "releasehook"])

// the ops it wrote, as they'll be in the scarf: no version or headers, no
// `;!source:` (its lines are the block's, not the .k's), and not the main
// carrier going in or out
export function opsOf(knitout: string, carrier: string) {
	const ops: string[] = []
	for (const raw of knitout.split("\n")) {
		if (/^;!|^;;/.test(raw)) continue
		const line = raw.replace(/\s*;!source:.*$/, "").trimEnd()
		if (!line.trim()) continue
		const [name, ...args] = line.trim().split(/\s+/)
		if (CARRIER_OPS.has(name) && args.length === 1 && args[0] === carrier) continue
		ops.push(line)
	}
	return ops
}

// (what of the writer home() uses)
interface KnitoutWriter {
	_operations: unknown[]
	in(carrier: string): void
	rack(racking: number): void
	xfer(from: string, to: string): void
	miss(direction: string, needle: string, carrier: string): void
}

export async function runKnitoutBlock(code: string, options: KnitoutBlockOptions): Promise<KnitoutBlockResult> {
	const {minNeedle, maxNeedle, carrier, start, globals = {}} = options
	let error: KnitoutBlockResult["error"] = null
	const knitout = await evalJS(withRequires(code), {
		globals: ({Writer}: {Writer: new (options: {carriers: string[]}) => KnitoutWriter}) => {
			const k = new Writer({carriers: CARRIERS})
			k.in(carrier)
			// home: where k's left everything, followed from the start, and
			// brought back
			const home = () => {
				const loops = new Loops(minNeedle, maxNeedle - minNeedle + 1, carrier, start)
				for (const op of k._operations) loops.follow(String(op))
				for (const line of loops.home()) {
					const [name, ...args] = line.split(" ")
					if (name === "rack") k.rack(0)
					else if (name === "xfer") k.xfer(args[0], args[1])
					else if (name === "miss") k.miss(args[0], args[1], args[2])
				}
			}
			return {
				k,
				min_needle: minNeedle,
				max_needle: maxNeedle,
				carrier,
				main_carrier: carrier,
				home,
				__lattice: globals,
				...globals,
			}
		},
		onError: (e: unknown, line: number | null) => {
			error = {message: e instanceof Error ? `${e.name}: ${e.message}` : String(e), line: line ?? null}
		},
	})
	return {ops: opsOf(knitout, carrier), error}
}

// its ops, read back as rows of stitches, the first knitted first: a row for
// each pass (the ops one after another the same way with the same
// carriers, a needle's bed at most once), a cell for each of the scarf's
// needles. a knit or a tuck is the bed it's on (both beds, in one pass: the
// back's shown); a needle the row didn't knit is nothing. a transfer, or a
// racking, ends a pass. and each row's carrier: its pass's first
export function stitchRows(ops: string[], minNeedle: number, width: number) {
	const rows: Uint8Array[] = []
	const carriers: string[] = []
	let row: Uint8Array | null = null
	let pass = ""
	let seen = new Set<string>()
	for (const raw of ops) {
		const text = raw.split(";")[0].trim()
		if (!text) continue
		const [name, ...args] = text.split(/\s+/)
		if (name === "knit" || name === "tuck") {
			const at = args[1]?.match(/^([fb])s?(-?\d+)$/)
			if (!at) continue
			const n = Number(at[2])
			const key = `${args[0]} ${args.slice(2).join(" ")}`
			if (!row || key !== pass || seen.has(at[1] + n)) {
				row = new Uint8Array(width).fill(Stitch.NONE)
				rows.push(row)
				carriers.push(args[2] ?? "")
				pass = key
				seen = new Set()
			}
			seen.add(at[1] + n)
			const x = n - minNeedle
			if (x >= 0 && x < width && row[x] !== Stitch.BACK) row[x] = at[1] === "b" ? Stitch.BACK : Stitch.FRONT
		} else if (name === "xfer" || name === "rack" || name === "split" || name === "drop") {
			row = null
		}
	}
	const stitches = new Uint8Array(width * rows.length)
	rows.forEach((cells, y) => stitches.set(cells, y * width))
	return {height: rows.length, stitches, carriers}
}
