import {Stitch, type Grid} from "./stitches.ts"

// the scarf, as knitout: a cast on, each block's rows one after another (a
// pass of transfers first, wherever a needle's loop has to change beds, then
// the row knitted across), a couple of plain rows, and out. one yarn, at
// racking 0, for the kniterate

export interface KnitoutOptions {
	/** the needle the scarf's first column is on */
	minNeedle?: number
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
}

export function knitoutOf(blocks: Grid[], options: KnitoutOptions = {}): string {
	const {minNeedle = 1, carrier = "1", title = "knitfold", plainRows = 2, colour, plating, sources = []} = options
	const width = blocks[0]?.width ?? 0
	const lines: string[] = [
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
	if (!width) return lines.join("\n") + "\n"
	const needles = Array.from({length: width}, (_, x) => minNeedle + x)
	// where each needle's loop is: on the front bed, or the back
	const bedOf = needles.map(() => "f")
	let dir: "+" | "-" = "+"
	const across = () => (dir === "+" ? needles.map((_, x) => x) : needles.map((_, x) => width - 1 - x))
	const turn = () => (dir = dir === "+" ? "-" : "+")

	// a row: transfers for the needles changing beds, then the knitting
	function row(stitchAt: (x: number) => number) {
		for (const x of across()) {
			const stitch = stitchAt(x)
			const want = stitch === Stitch.BACK ? "b" : stitch === Stitch.FRONT ? "f" : bedOf[x]
			if (want === bedOf[x]) continue
			const n = needles[x]
			lines.push(want === "b" ? `xfer f${n} b${n}` : `xfer b${n} f${n}`)
			bedOf[x] = want
		}
		for (const x of across()) {
			const stitch = stitchAt(x)
			const at = `${bedOf[x]}${needles[x]}`
			lines.push(`knit ${dir} ${at} ${carrier}`)
		}
		turn()
	}

	lines.push(`in ${carrier}`)
	// cast on: every other needle tucked going, the others coming back
	lines.push("; cast on")
	for (const x of across()) if (x % 2 === 0) lines.push(`tuck ${dir} f${needles[x]} ${carrier}`)
	turn()
	for (const x of across()) if (x % 2 === 1) lines.push(`tuck ${dir} f${needles[x]} ${carrier}`)
	turn()
	for (let r = 0; r < plainRows; r++) row(() => Stitch.FRONT)

	blocks.forEach((block, b) => {
		lines.push(`; block ${b + 1}`)
		for (let y = 0; y < block.height; y++) {
			row(x => (x < block.width ? block.stitches[x + y * block.width] : Stitch.FRONT))
		}
	})

	lines.push("; plain rows to finish")
	for (let r = 0; r < plainRows; r++) row(() => Stitch.FRONT)
	// (no bind off yet: it comes off the machine held by these rows)
	lines.push(`out ${carrier}`)
	return lines.join("\n") + "\n"
}
