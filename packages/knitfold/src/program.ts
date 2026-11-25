import {Op} from "./vendor/knitscape/shared/opData.js"

// a .k as a knitscape knitting program, for its contact-node topology
// (vendor/knitscape). this is lattice's knitscape-program.js (chee's, in
// lattice.patchwork.inkandswitch.com), with a reader for the knitout it
// needs: a row for each pass, a cell for each needle in it, and for each row
// its yarn (1 up, the carrier's place in the .k's carriers; null for a row
// of transfers or drops), its direction and its racking.
//
// - a pass is the ops one after another with the same carrier, going the
//   same way at the same racking. a needle that comes up twice in one is
//   two rows
// - transfers are rows of no yarn, one for each racking they're at; drops
//   are drops in a row of no yarn
// - its back needle n is opposite front n − racking, knitout's n + racking:
//   so its racking is knitout's, the other way round
// - the needles start empty (`castOn: false`)

interface Needle {
	back: boolean
	n: number
}

interface KnitoutOp {
	kind: "knit" | "tuck" | "miss" | "drop" | "split" | "rack" | "in" | "out"
	dir?: "+" | "-"
	needle?: Needle
	to?: Needle
	carriers: string[]
	rack?: number
	/** which block it's in (a `; block N` comment before it), from 0; -1 before any */
	block: number
}

export interface Knitout {
	ops: KnitoutOp[]
	carriers: string[]
}

function needleOf(text: string): Needle {
	const match = text?.match(/^([fb])s?(-?\d+)$/)
	if (!match) throw new Error(`not a needle: ${text}`)
	return {back: match[1] === "b", n: Number(match[2])}
}

export function readKnitout(text: string): Knitout {
	const ops: KnitoutOp[] = []
	const carriers: string[] = []
	let block = -1
	const yarns = (names: string[]) => {
		for (const name of names) if (!carriers.includes(name)) carriers.push(name)
		return names
	}
	for (const raw of text.split("\n")) {
		const header = raw.match(/^;;Carriers:\s*(.*)$/)
		if (header) {
			yarns(header[1].trim().split(/\s+/).filter(Boolean))
			continue
		}
		const marker = raw.match(/^;\s*block (\d+)/)
		if (marker) {
			block = Number(marker[1]) - 1
			continue
		}
		if (/^;\s*(plain rows to finish|between blocks)/.test(raw)) {
			block = -1
			continue
		}
		const semi = raw.indexOf(";")
		const opText = (semi === -1 ? raw : raw.slice(0, semi)).trim()
		if (!opText) continue
		const [name, ...args] = opText.split(/\s+/)
		if (name === "knit" || name === "tuck" || name === "miss") {
			ops.push({kind: name, dir: args[0] as "+" | "-", needle: needleOf(args[1]), carriers: yarns(args.slice(2)), block})
		} else if (name === "drop") {
			ops.push({kind: "drop", dir: "+", needle: needleOf(args[0]), carriers: [], block})
		} else if (name === "split") {
			ops.push({
				kind: "split",
				dir: args[0] as "+" | "-",
				needle: needleOf(args[1]),
				to: needleOf(args[2]),
				carriers: yarns(args.slice(3)),
				block,
			})
		} else if (name === "xfer") {
			ops.push({kind: "split", dir: "+", needle: needleOf(args[0]), to: needleOf(args[1]), carriers: [], block})
		} else if (name === "rack") {
			ops.push({kind: "rack", rack: Number(args[0]), carriers: [], block})
		} else if (name === "in" || name === "inhook") {
			ops.push({kind: "in", carriers: yarns(args), block})
		} else if (name === "out" || name === "outhook") {
			ops.push({kind: "out", carriers: yarns(args), block})
		}
	}
	return {ops, carriers}
}

function grid(width: number, rows: Map<number, number>[]) {
	const height = rows.length
	const pixels = new Uint8Array(width * height).fill(Op.EMPTY)
	rows.forEach((cells, y) => {
		for (const [x, op] of cells) pixels[x + y * width] = op
	})
	return {
		width,
		height,
		pixels,
		pixel(x: number, y: number) {
			if (x > width - 1 || x < 0 || y > height - 1 || y < 0) return -1
			return pixels[x + y * width]
		},
	}
}

function needlesOf(ops: KnitoutOp[]) {
	let min = Infinity
	let max = -Infinity
	for (const op of ops) {
		for (const needle of [op.needle, op.to]) {
			if (!needle) continue
			if (needle.n < min) min = needle.n
			if (needle.n > max) max = needle.n
		}
	}
	return min > max ? {min: 0, max: 0} : {min, max}
}

type Dir = "left" | "right"
const flip = (dir: Dir): Dir => (dir === "right" ? "left" : "right")

interface Row {
	cells: Map<number, number>
	kind: "yarn" | "xfer" | "drop"
	yarn: number | null
	dir: Dir
	rack: number
	block: number
}

export function programOf(knitout: Knitout) {
	const {min, max} = needlesOf(knitout.ops)
	const width = max - min + 1
	const rows: Row[] = []
	const yarnOf = (name: string) => Math.max(0, knitout.carriers.indexOf(name)) + 1
	let rack = 0
	const theirs = () => (rack ? -rack : 0)
	let current: Row | null = null

	let block = -1
	function rowFor(x: number, kind: Row["kind"], yarn: number | null, dir: Dir | null, rowRack: number) {
		const fits =
			current &&
			current.kind === kind &&
			current.yarn === yarn &&
			(dir == null || current.dir === dir) &&
			(kind === "drop" || current.rack === rowRack) &&
			current.block === block &&
			!current.cells.has(x)
		if (!fits) {
			const before = rows[rows.length - 1]
			current = {cells: new Map(), kind, yarn, dir: dir ?? (before ? flip(before.dir) : "right"), rack: rowRack, block}
			rows.push(current)
		}
		return current!
	}
	const noYarn = (kind: Row["kind"]) => (current?.kind === "drop" || current?.kind === "xfer" ? current.kind : kind)

	for (const op of knitout.ops) {
		if (op.kind === "rack") {
			rack = op.rack ?? 0
			continue
		}
		if (!op.needle) continue
		block = op.block
		const x = op.needle.n - min
		const back = op.needle.back
		const yarned = op.carriers.length > 0
		if (op.kind === "split" && !yarned) {
			const to = op.to!
			if (to.back === back) continue
			const rowRack = back ? op.needle.n - to.n : to.n - op.needle.n
			const row = rowFor(x, "xfer", null, null, rowRack)
			if (row.kind === "drop") row.kind = "xfer"
			row.cells.set(x, back ? Op.BTF : Op.FTB)
		} else if (op.kind === "drop" || (op.kind === "knit" && !yarned)) {
			const kind = noYarn("drop")
			const row = rowFor(x, kind, null, null, kind === "xfer" ? current!.rack : theirs())
			row.cells.set(x, back ? Op.BDROP : Op.FDROP)
		} else if (yarned && (op.kind === "knit" || op.kind === "tuck" || op.kind === "miss" || op.kind === "split")) {
			const dir: Dir = op.dir === "-" ? "left" : "right"
			const row = rowFor(x, "yarn", yarnOf(op.carriers[0]), dir, theirs())
			const cell =
				op.kind === "miss" ? Op.MISS : op.kind === "tuck" ? (back ? Op.BTUCK : Op.FTUCK) : back ? Op.BKNIT : Op.FKNIT
			row.cells.set(x, cell)
		}
	}

	return {
		width,
		height: rows.length,
		min,
		ops: grid(width, rows.map(row => row.cells)),
		yarnFeeder: rows.map(row => row.yarn),
		direction: rows.map(row => row.dir),
		racking: rows.map(row => row.rack),
		/** each row's block, -1 for the cast on and the rows after */
		blocks: rows.map(row => row.block),
		castOn: false,
	}
}
