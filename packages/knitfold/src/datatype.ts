import type {AutomergeUrl, Repo} from "@automerge/automerge-repo"

// a knitfold: a scarf, a stack of blocks, each its own code making a grid of
// stitches. the first block is the first knitted (the bottom of the scarf).
// a block's code is a file (a .js, patchwork's own file doc), so it opens in
// patchwork's file tool, here and anywhere

export interface KnitfoldBlock {
	/** the block's .js */
	file?: AutomergeUrl
	/** (a block from before blocks were files: its code, here) */
	code?: string
}

export interface CodeFile {
	"@patchwork": {type: "file"}
	name: string
	extension: string
	mimeType: string
	content: string
}

export function codeFile(name: string, content: string): CodeFile {
	return {"@patchwork": {type: "file"}, name, extension: "js", mimeType: "text/javascript", content}
}

export interface KnitfoldDoc {
	title: string
	/** stitches across, every block */
	width: number
	/** rows in a block */
	height: number
	/** the yarn's colour: the one on the face of every loop */
	yarn: string
	/** plated with: a second yarn, behind the first, on the loops' backs
	 * (so on the purls, from the front). null: not plated */
	plating?: string | null
	/** the scarf's own yarns: colours added to the list to choose from */
	yarns?: string[]
	blocks: KnitfoldBlock[]
}

export const BLOCK_SIZE = 64

/** the sizes a block can be (square) */
export const BLOCK_SIZES = [32, 48, 64, 96, 128]

/** yarns, in riso inks: fluorescent pink, cornflower, teal, sunflower,
 * orange, violet, plum and cream */
export const YARNS = ["#ff48b0", "#5d84d6", "#3fae9b", "#ffb511", "#ff7f4f", "#9b7fd4", "#4a3550", "#f3e9dc"]

export const STARTERS = [
	`// a block's code is run for every stitch, like tixy:
// x across, y up (0's the first row knitted), or col and
// row if you'd rather, i the stitch,
// w and h the block's size, t the time (in seconds: the
// chart moves; what's knitted is t at 0). Math's in here.
// give back a stitch:
//   b back   f front   g garter   s seed
//   r rib   r1 1×1 rib   r2 2×2 rib   r3 1×2 rib
// (or a number: 0 back, 1 front, 2 garter, 3 seed,
// 4 1×1 rib, 5 2×2 rib, 6 1×2 rib)

x < 4 || x >= w - 4 ? s : r2`,
	`// basketweave: squares of 8, front and back by turns
(x >> 3 ^ y >> 3) & 1 ? b : f`,
	`// a seed stitch moon, on garter
hypot(x - w / 2, y - h / 2) < 20 ? s : g`,
	`// waves of seed (they move, with t)
sin(x / 5 + y / 10 + t) > 0.3 ? s : f`,
]

// a new block's file
export function newBlock(repo: Repo, n: number, code: string): KnitfoldBlock {
	return {file: repo.create<CodeFile>(codeFile(`block ${n + 1}.js`, code)).url}
}

export function initKnitfold(doc: KnitfoldDoc, repo: Repo) {
	doc.title = "scarf"
	doc.width = BLOCK_SIZE
	doc.height = BLOCK_SIZE
	doc.yarn = YARNS[0]
	doc.plating = YARNS[5]
	doc.blocks = STARTERS.map((code, n) => newBlock(repo, n, code))
}

export const KnitfoldDatatype = {
	init: initKnitfold,
	getTitle(doc: KnitfoldDoc) {
		return doc.title || "scarf"
	},
	setTitle(doc: KnitfoldDoc, title: string) {
		doc.title = title
	},
	markCopy(doc: KnitfoldDoc) {
		doc.title = `copy of ${doc.title || "scarf"}`
	},
}

export default KnitfoldDatatype
