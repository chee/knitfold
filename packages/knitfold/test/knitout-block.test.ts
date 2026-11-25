import {test} from "node:test"
import assert from "node:assert/strict"
import {opsOf, runKnitoutBlock, stitchRows, withRequires} from "../src/knitout-block.ts"
import {KNITOUT_BLOCK} from "../src/datatype.ts"
import {knitoutOf} from "../src/knitout.ts"
import {compile, gridOf, Stitch} from "../src/stitches.ts"
import {knitoutToKcode} from "../src/vendor/kcode/knitout-to-kcode.js"

const quiet = async <T>(run: () => Promise<T>) => {
	// (the knitout writer warns, and the run says what it's writing)
	const {warn, log} = console
	console.warn = console.log = () => {}
	try {
		return await run()
	} finally {
		Object.assign(console, {warn, log})
	}
}

test("a knitout.js block's given k, min_needle, max_needle and main_carrier", async () => {
	const {ops, error} = await quiet(() =>
		runKnitoutBlock(`for (let n = min_needle; n <= max_needle; ++n) k.knit("+", "f" + n, main_carrier)`, {minNeedle: 5, maxNeedle: 8, carrier: "3"}),
	)
	assert.equal(error, null)
	// (k's main carrier was in before it started, and that's not in its ops)
	assert.deepEqual(ops, ["knit + f5 3", "knit + f6 3", "knit + f7 3", "knit + f8 3"])
})

test("a knitout.js block as lattice writes one: its own writer, in and out", async () => {
	const code = `const knitout = require('knitout')
let w = new knitout.Writer({carriers: ["1", "2", "3", "4", "5", "6"]})
w.in(main_carrier)
w.knit("+", "f1", main_carrier)
w.out(main_carrier)`
	const {ops, error} = await quiet(() => runKnitoutBlock(code, {minNeedle: 1, maxNeedle: 4, carrier: "3"}))
	assert.equal(error, null)
	assert.deepEqual(ops, ["knit + f1 3"])
})

test("imports of knitout and lattice, as consts on their own lines", () => {
	const code = withRequires(`import knitout from "knitout"\nimport {doc, get as fetch} from "lattice"\nimport * as kn from 'knitout';\nk.knit()`)
	assert.equal(code, `const knitout = require("knitout");\nconst {doc, get: fetch} = __lattice;\nconst kn = require("knitout");\nk.knit()`)
})

test("a knitout.js block's error says its line", async () => {
	const {error} = await quiet(() => runKnitoutBlock(`k.knit("+", "f1", main_carrier)\nk.knit("+", "q1", main_carrier)`, {minNeedle: 1, maxNeedle: 4, carrier: "3"}))
	assert.ok(error)
	assert.match(error!.message, /q1/)
	assert.equal(error!.line, 2)
})

test("its ops: no headers, no source lines, no main carrier in or out", () => {
	const knitout = [";!knitout-2", ";;Carriers: 1 2 3", "in 3", "in 2", "knit + f1 3 ;!source:4", ";a comment", "out 3", ""].join("\n")
	assert.deepEqual(opsOf(knitout, "3"), ["in 2", "knit + f1 3", ";a comment"])
})

test("its rows, read back: a pass a row, a cell a needle", () => {
	const rows = stitchRows(["knit + f1 3", "knit + b2 3", "knit + f3 3", "knit - f3 3", "knit - f1 3", "xfer f1 b1", "knit + b1 3"], 1, 3)
	assert.equal(rows.height, 3)
	assert.deepEqual([...rows.stitches], [
		Stitch.FRONT, Stitch.BACK, Stitch.FRONT,
		Stitch.FRONT, Stitch.NONE, Stitch.FRONT,
		Stitch.BACK, Stitch.NONE, Stitch.NONE,
	])
})

test("a new knitout.js block runs: 24 rows, a band of rib", async () => {
	const {ops, error} = await quiet(() => runKnitoutBlock(KNITOUT_BLOCK, {minNeedle: 1, maxNeedle: 8, carrier: "3"}))
	assert.equal(error, null)
	const rows = stitchRows(ops, 1, 8)
	assert.equal(rows.height, 24)
	assert.equal(rows.stitches[1], Stitch.BACK)
	// (12 rows of rib, then 12 of stockinette)
	assert.equal(rows.stitches[1 + 11 * 8], Stitch.BACK)
	assert.equal(rows.stitches[1 + 12 * 8], Stitch.FRONT)
})

test("home(): every loop to the front bed, racking 0, the carrier to the left", async () => {
	const code = `k.xfer("f2", "b2")
k.rack(1)
k.knit("+", "f1", carrier)
k.knit("+", "b2", main_carrier)
home()
home()`
	const {ops, error} = await quiet(() => runKnitoutBlock(code, {minNeedle: 1, maxNeedle: 3, carrier: "3"}))
	assert.equal(error, null)
	// (the second's nothing: it's home already)
	assert.deepEqual(ops, ["xfer f2 b2", "rack 1", "knit + f1 3", "knit + b2 3", "rack 0", "xfer b2 f2", "miss - f1 3"])
})

test("the scarf: a knitout.js block's ops as they are, from wherever what came before left things", () => {
	// one row of 1×1 rib: the carrier's on the right after it, the rib's back
	// needles on the back bed. nothing's done for the block (it's no home())
	const rib = gridOf(compile("r1"), 4, 1)
	const k = knitoutOf([rib, {ops: ["knit - f4 3", "knit - b3 3", "rack 1"]}, gridOf(compile("f"), 4, 1)], {plainRows: 0})
	const lines = k.split("\n")
	const block2 = lines.indexOf("; block 2")
	assert.equal(lines[block2 - 1], "knit + b4 3")
	assert.deepEqual(lines.slice(block2 + 1, block2 + 4), ["knit - f4 3", "knit - b3 3", "rack 1"])
	// before knitfold's rows, after it: racking 0 (and its rows go on from
	// where it left the carrier, transferring what they need)
	const block3 = lines.indexOf("; block 3")
	assert.deepEqual(lines.slice(block2 + 4, block3), ["; between blocks", "rack 0"])
	assert.deepEqual(lines.slice(block3 + 1, block3 + 4), ["xfer b2 f2", "xfer b3 f3", "knit + f1 3"])
})

test("the scarf: what goes between blocks, only between", () => {
	const plain = gridOf(compile("f"), 2, 1)
	const k = knitoutOf([plain, plain, plain], {plainRows: 0, between: ["; a seam", "knit - f2 3", "knit - f1 3"]})
	const lines = k.split("\n")
	assert.equal(lines.filter(line => line === "; between blocks").length, 2)
	const seam = lines.indexOf("; between blocks")
	assert.ok(seam > lines.indexOf("; block 1"))
	assert.deepEqual(lines.slice(seam + 1, seam + 4), ["; a seam", "knit - f2 3", "knit - f1 3"])
	// (it went -, so the block after goes +)
	assert.equal(lines[lines.indexOf("; block 2") + 1], "knit + f1 3")
})

test("home(), at the start: from where what came before left things", async () => {
	const start = {beds: ["f", "b", "f", "b"], dir: "-" as const, rack: 0}
	const {ops} = await quiet(() => runKnitoutBlock(`home()\nk.knit("+", "f1", carrier)`, {minNeedle: 1, maxNeedle: 4, carrier: "3", start}))
	assert.deepEqual(ops, ["xfer b2 f2", "xfer b4 f4", "miss - f1 3", "knit + f1 3"])
	// (home already: nothing)
	const none = await quiet(() => runKnitoutBlock(`home()`, {minNeedle: 1, maxNeedle: 4, carrier: "3"}))
	assert.deepEqual(none.ops, [])
})

test("the scarf with a knitout.js block, from a needle of its own, as kcode", async () => {
	const {ops} = await quiet(() => runKnitoutBlock(KNITOUT_BLOCK, {minNeedle: 20, maxNeedle: 43, carrier: "3"}))
	const k = knitoutOf([gridOf(compile("r2"), 24, 3), {ops}, gridOf(compile("s"), 24, 4)], {minNeedle: 20, between: ["knit - f20 3"]})
	assert.ok(k.includes("tuck + f20 3"))
	const kcode = await quiet(async () => knitoutToKcode(k, "scarf.k", {}))
	assert.ok(kcode.length > 0)
})
