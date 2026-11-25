import {Loops} from "./loops.ts"
import {Stitch, type Grid} from "./stitches.ts"
import {addWasteSection, lineWriter} from "./waste.ts"

// the scarf, as knitout: a cast on, each block's rows one after another (a
// pass of transfers first, wherever a needle's loop has to change beds, then
// the row knitted across), a couple of plain rows, and out. one yarn, at
// racking 0, for the kniterate.
//
// a knitout.js block (knitout-block.ts) is its own ops, as they are, and so
// is the scarf's knitout.js for between each block and the next: each
// starts from wherever what came before left the loops, the carrier and the
// racking (loops.ts: and its home() brings them back, if it wants them
// back). knitfold's own rows want racking 0, so before them it's put back
// to 0; they transfer what they need to, and carry on from wherever the
// carrier is. the scarf's made a part at a time (Scarf), so a knitout.js
// part can be run knowing where everything is as it starts

/** a knitout.js block's part of the scarf: its ops, as they are */
export interface KnitoutPart {
	ops: string[]
}

export type Part = Grid | KnitoutPart

const isKnitout = (part: Part): part is KnitoutPart => "ops" in part

export interface KnitoutOptions {
	/** the needle the scarf's first column is on */
	minNeedle?: number
	/** stitches across (else the first grid's) */
	width?: number
	carrier?: string
	title?: string
	/** plain rows before the first block and after the last */
	plainRows?: number
	/** the ;;Yarn-<carrier>: colour, for visualisers that read it */
	colour?: string
	/** and what it's plated with */
	plating?: string | null
	/** the patchwork docs it's made from, pinned (`automerge:<id>#<heads>`):
	 * the scarf, then each block's code. written as lattice writes them, an
	 * `x-patchwork-sources` line after the headers (nothing for the machine) */
	sources?: string[]
	/** ops to go between each block and the next (the scarf's knitout.js
	 * for in between, run: knitout-block.ts) */
	between?: string[]
	/** start on Agnes Cameron's waste section (waste.ts), its cast on in
	 * place of knitfold's */
	waste?: boolean
}

export class Scarf {
	readonly lines: string[]
	readonly loops: Loops
	/** the waste section's knitout, if it starts on one */
	readonly wasteLines: string[] = []
	readonly carrier: string
	readonly plainRows: number
	private blocks = 0
	/** what knitted last: knitfold's rows, or knitout that isn't */
	private last: "rows" | "knitout" = "rows"

	constructor(width: number, options: KnitoutOptions = {}) {
		const {minNeedle = 1, carrier = "3", title = "knitfold", plainRows = 2, colour, plating, sources = [], waste = false} = options
		this.carrier = carrier
		this.plainRows = plainRows
		this.loops = new Loops(minNeedle, width, carrier)
		this.lines = [
			";!knitout-2",
			";;Machine: kniterate",
			";;Carriers: 1 2 3 4 5 6",
			";;Width: 252",
			";;Position: Keep",
			...(colour ? [`;;Yarn-${carrier}: ${colour}${plating ? ` plated with ${plating}` : ""}`] : []),
			...(sources.length ? [`x-patchwork-sources ${sources.join(" ")}`] : []),
			// (a plain comment: a ;; line is a header, which wants "Name: value")
			`; ${title.replace(/\n/g, " ")}, from knitfold`,
		]
		if (!width) return
		const {lines, loops} = this
		if (waste) {
			// (it brings the yarn in, and casts on: knitfold's carries on from
			// wherever it leaves everything)
			lines.push("; waste section, Agnes Cameron's")
			addWasteSection(lineWriter(this.wasteLines), [carrier], carrier, minNeedle, minNeedle + width - 1)
			this.put(this.wasteLines)
			this.settle()
		} else {
			lines.push(`in ${carrier}`)
			// cast on: every other needle tucked going, the others coming back
			lines.push("; cast on")
			for (const x of this.across()) if (x % 2 === 0) lines.push(`tuck ${loops.dir} f${loops.needles[x]} ${carrier}`)
			loops.turn()
			for (const x of this.across()) if (x % 2 === 1) lines.push(`tuck ${loops.dir} f${loops.needles[x]} ${carrier}`)
			loops.turn()
		}
		for (let r = 0; r < plainRows; r++) this.row(() => Stitch.FRONT)
	}

	private across() {
		const {needles, dir} = this.loops
		return dir === "+" ? needles.map((_, x) => x) : needles.map((_, x) => needles.length - 1 - x)
	}

	// knitfold's rows want racking 0: put back to it, after knitout that
	// isn't knitfold's (before what's next says it's started)
	private settle() {
		if (this.last !== "knitout") return
		const straight = this.loops.straight()
		if (straight.length) this.lines.push("; between blocks", ...straight)
		this.last = "rows"
	}

	// a row of knitfold's: transfers for the needles changing beds, then the
	// knitting
	private row(stitchAt: (x: number) => number) {
		const {lines, loops, carrier} = this
		const {needles, beds} = loops
		for (const x of this.across()) {
			const stitch = stitchAt(x)
			const want = stitch === Stitch.BACK ? "b" : stitch === Stitch.FRONT ? "f" : beds[x]
			if (want === beds[x]) continue
			const n = needles[x]
			lines.push(want === "b" ? `xfer f${n} b${n}` : `xfer b${n} f${n}`)
			beds[x] = want
		}
		for (const x of this.across()) lines.push(`knit ${loops.dir} ${beds[x]}${needles[x]} ${carrier}`)
		loops.turn()
	}

	// knitout that isn't knitfold's: as it is, where it leaves everything
	// followed
	private put(ops: string[]) {
		for (const line of ops) {
			this.lines.push(line)
			this.loops.follow(line)
		}
		if (ops.length) this.last = "knitout"
	}

	/** between the last block and the next: the scarf's knitout.js's ops */
	between(ops: string[]) {
		if (!ops.length) return
		this.lines.push("; between blocks")
		this.put(ops)
	}

	/** the next block */
	block(part: Part) {
		if (!isKnitout(part)) this.settle()
		this.lines.push(`; block ${++this.blocks}`)
		if (isKnitout(part)) return this.put(part.ops)
		for (let y = 0; y < part.height; y++) {
			this.row(x => (x < part.width ? part.stitches[x + y * part.width] : Stitch.FRONT))
		}
	}

	/** a couple of plain rows, and out: the .k */
	finish() {
		const {lines} = this
		if (this.loops.width) {
			this.settle()
			lines.push("; plain rows to finish")
			for (let r = 0; r < this.plainRows; r++) this.row(() => Stitch.FRONT)
			// (no bind off yet: it comes off the machine held by these rows)
			lines.push(`out ${this.carrier}`)
		}
		return lines.join("\n") + "\n"
	}
}

export function knitoutOf(blocks: Part[], options: KnitoutOptions = {}): string {
	const width = options.width ?? blocks.find((part): part is Grid => !isKnitout(part))?.width ?? 0
	const scarf = new Scarf(width, options)
	if (!width) return scarf.finish()
	blocks.forEach((part, b) => {
		if (b > 0) scarf.between(options.between ?? [])
		scarf.block(part)
	})
	return scarf.finish()
}
