import {test} from "node:test"
import assert from "node:assert/strict"
import {compile, gridOf, Stitch, Technique, techniqueOf, stitchOf, BlockError} from "../src/stitches.ts"
import {knitoutOf} from "../src/knitout.ts"
import {programOf, readKnitout} from "../src/program.ts"

test("an expression, or a body with a return", () => {
	assert.equal(compile("r")(1, 0, 0, 4, 4, 0), Technique.RIB)
	assert.equal(compile("x % 2 ? b : f")(1, 0, 0, 4, 4, 0), Technique.BACK)
	assert.equal(compile("// a comment\ns")(0, 0, 0, 4, 4, 0), Technique.SEED)
	assert.equal(compile("let k = r1\nreturn k")(0, 0, 0, 4, 4, 0), Technique.RIB)
	assert.equal(compile("[f, g, s, r, r1, r2][y]")(0, 5, 0, 4, 4, 5), Technique.RIB2)
	assert.equal(compile("t")(0, 3, 0, 4, 4, 1.5), 1.5)
	// (the old capitals still work)
	assert.equal(compile("SEED")(0, 0, 0, 4, 4, 0), Technique.SEED)
	assert.equal(compile("hypot(3, 4)")(0, 0, 0, 4, 4, 0), 5)
	assert.equal(compile("")(0, 0, 0, 4, 4, 0), Technique.FRONT)
	assert.equal(compile("col === 3 && row === 2 ? b : f")(3, 2, 0, 4, 4, 0), Technique.BACK)
	assert.equal(compile("col === 3 && row === 2 ? b : f")(2, 3, 0, 4, 4, 0), Technique.FRONT)
})

test("what comes back, as a technique", () => {
	assert.equal(techniqueOf(true), Technique.FRONT)
	assert.equal(techniqueOf(false), Technique.BACK)
	assert.equal(techniqueOf(0), Technique.BACK)
	assert.equal(techniqueOf(1), Technique.FRONT)
	assert.equal(techniqueOf(undefined), Technique.FRONT)
	assert.equal(techniqueOf(NaN), Technique.FRONT)
	assert.equal(techniqueOf("s"), Technique.SEED)
	assert.equal(techniqueOf("r2"), Technique.RIB2)
	assert.equal(techniqueOf(42), Technique.FRONT)
})

test("techniques as blob makes them", () => {
	const row = (t: number, y = 0) => [0, 1, 2, 3, 4, 5].map(x => stitchOf(t, x, y))
	const {FRONT: F, BACK: B} = Stitch
	assert.deepEqual(row(Technique.RIB), [F, B, F, B, F, B])
	assert.deepEqual(row(Technique.RIB2), [F, F, B, B, F, F])
	assert.deepEqual(row(Technique.RIB3), [F, B, B, F, B, B])
	assert.deepEqual(row(Technique.SEED, 1), [B, F, B, F, B, F])
	assert.deepEqual(row(Technique.GARTER, 1), [B, B, B, B, B, B])
})

test("t's the time", () => {
	const fn = compile("t > 1 ? b : f")
	assert.equal(gridOf(fn, 2, 2, 0).stitches[0], Stitch.FRONT)
	assert.equal(gridOf(fn, 2, 2, 2).stitches[0], Stitch.BACK)
})

test("a throw says where", () => {
	assert.throws(() => gridOf(compile("if (x == 2 && y == 1) throw new Error('no'); return 0"), 4, 4), (error: unknown) => {
		return error instanceof BlockError && error.x === 2 && error.y === 1
	})
})

test("knitout: transfers where the bed changes, then the row", () => {
	const grid = gridOf(compile("r1"), 4, 2)
	const k = knitoutOf([grid], {plainRows: 0})
	const lines = k.split("\n")
	assert.ok(lines.includes("in 1") && lines.includes("out 1"))
	// rib's needles 2 and 4 to the back, once
	assert.equal(lines.filter(line => line.startsWith("xfer")).length, 2)
	assert.ok(lines.includes("xfer f2 b2") && lines.includes("xfer f4 b4"))
	assert.ok(lines.includes("knit + b2 1") && lines.includes("knit - b4 1"))
})

test("knitout reads back as a knitscape program", () => {
	const grid = gridOf(compile("g"), 6, 4)
	const program = programOf(readKnitout(knitoutOf([grid], {plainRows: 1})))
	assert.equal(program.width, 6)
	// cast on (2), a plain row, 4 rows (3 of them after transfers), 1 after (with transfers)
	const yarnRows = program.yarnFeeder.filter(yarn => yarn !== null).length
	assert.equal(yarnRows, 2 + 1 + 4 + 1)
	assert.equal(program.yarnFeeder.filter(yarn => yarn === null).length, 4)
})
