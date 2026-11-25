// where the scarf's loops are, as knitout's written: on the front bed or
// the back, for each of the scarf's needles; which way its carrier goes
// next (+ when it's on the left); and the racking. followed through any
// knitout (knitfold's own, a knitout.js block's), so what's next can be
// made ready for: every loop brought to the front bed, at racking 0, and
// the carrier to the left (home). knitout.ts has it between blocks, and a
// knitout.js block's home() (knitout-block.ts) has it too

/** where everything is: what a knitout.js part's told as it starts */
export interface LoopsState {
	beds: string[]
	dir: "+" | "-"
	rack: number
}

export class Loops {
	readonly minNeedle: number
	readonly width: number
	readonly carrier: string
	readonly needles: number[]
	/** each needle's loop's bed: "f" or "b" */
	readonly beds: string[]
	/** which way the carrier goes next: + when it's on the left */
	dir: "+" | "-" = "+"
	rack = 0

	/** (from `start`, or home: everything on the front bed, the carrier on
	 * the left, at racking 0) */
	constructor(minNeedle: number, width: number, carrier: string, start?: LoopsState) {
		this.minNeedle = minNeedle
		this.width = width
		this.carrier = carrier
		this.needles = Array.from({length: width}, (_, x) => minNeedle + x)
		this.beds = this.needles.map((_, x) => start?.beds[x] ?? "f")
		if (start) {
			this.dir = start.dir
			this.rack = start.rack
		}
	}

	/** where everything is now, kept apart from what follows */
	state(): LoopsState {
		return {beds: [...this.beds], dir: this.dir, rack: this.rack}
	}

	turn() {
		this.dir = this.dir === "+" ? "-" : "+"
	}

	private columnOf(needle: string | undefined) {
		const at = needle?.match(/^([fb])s?(-?\d+)$/)
		const x = at ? Number(at[2]) - this.minNeedle : -1
		return at && x >= 0 && x < this.width ? {bed: at[1], x} : null
	}

	/** a line of knitout: where it leaves the loops, the carrier and the racking */
	follow(line: string) {
		const text = line.split(";")[0].trim()
		if (!text) return
		const [name, ...args] = text.split(/\s+/)
		if (name === "rack") this.rack = Number(args[0]) || 0
		else if (name === "knit" || name === "tuck" || name === "miss" || name === "split") {
			if (args.slice(name === "split" ? 3 : 2).includes(this.carrier)) this.dir = args[0] === "+" ? "-" : "+"
			if (name === "miss") return
			const at = this.columnOf(args[1])
			if (at) this.beds[at.x] = at.bed
			const to = name === "split" ? this.columnOf(args[2]) : null
			if (to) this.beds[to.x] = to.bed
		} else if (name === "xfer") {
			const to = this.columnOf(args[1])
			if (to) this.beds[to.x] = to.bed
		}
	}

	/** racking 0, if it isn't: the knitout for it */
	straight(): string[] {
		if (!this.rack) return []
		this.rack = 0
		return ["rack 0"]
	}

	/** home: every loop on the front bed, at racking 0, and the carrier on
	 * the left. the knitout for it (nothing, if it's there already) */
	home(): string[] {
		const out = this.straight()
		this.needles.forEach((n, x) => {
			if (this.beds[x] !== "b") return
			out.push(`xfer b${n} f${n}`)
			this.beds[x] = "f"
		})
		if (this.dir === "-") {
			out.push(`miss - f${this.needles[0]} ${this.carrier}`)
			this.dir = "+"
		}
		return out
	}
}
