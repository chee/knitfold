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

test("a body's last expression, given back", () => {
	assert.equal(compile("let k = x % 2\nk ? b : f")(1, 0, 0, 4, 4, 0), Technique.BACK)
	assert.equal(compile("const k = s;\nk;\n// the end")(0, 0, 0, 4, 4, 0), Technique.SEED)
	assert.equal(compile("let k = g\nif (x) k = s\nk")(1, 0, 0, 4, 4, 0), Technique.SEED)
	// (its own returns, inside, still return first: the end's given one too)
	assert.equal(compile("if (x) return b\nlet k = f\nk")(1, 0, 0, 4, 4, 0), Technique.BACK)
	assert.equal(compile("if (x) return b\nlet k = f\nk")(0, 0, 0, 4, 4, 0), Technique.FRONT)
	// (one at the end of its own: left as it is)
	assert.equal(compile("let k = r1\nreturn k")(0, 0, 0, 4, 4, 0), Technique.RIB)
	// (a return in a function inside doesn't count)
	assert.equal(compile("const pick = () => { return r2 }\npick()")(0, 0, 0, 4, 4, 0), Technique.RIB2)
})

test("every statement's an expression", () => {
	const run = (code: string, x = 0, y = 0) => compile(code)(x, y, 0, 4, 4, 0)
	assert.equal(run("if (x) {1} else {2}", 1), 1)
	assert.equal(run("if (x) {1} else {2}", 0), 2)
	assert.equal(run("if (x) s\nelse if (y) g\nelse { let k = r2; k }", 0, 0), Technique.RIB2)
	assert.equal(run("if (x) s\nelse if (y) g\nelse { let k = r2; k }", 0, 1), Technique.GARTER)
	assert.equal(run("let k = s\nif (x) { k }", 1), Technique.SEED)
	assert.equal(run("switch (x % 3) { case 0: b; break; case 1: f; break; default: s }", 4), Technique.FRONT)
	assert.equal(run("switch (x % 3) { case 0: b; break; case 1: f; break; default: s }", 5), Technique.SEED)
	assert.equal(run("try { nope() } catch { g }"), Technique.GARTER)
	assert.equal(run("let n = 0\nfor (let i = 0; i < 3; i++) { n += i; n }"), 3)
	assert.equal(run("let n = 0\nwhile (n < 5) n++"), 4)
	assert.equal(run("if (x) { for (const k of [g, s]) k } else f", 1), Technique.SEED)
	// (a comma's still the expression's)
	assert.equal(run("let a\nif (1) { a = 1, 2 }"), 2)
	// (nothing to give: a declaration's last)
	assert.equal(run("let k = s; let j = g"), undefined)
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

test("doc() and get(): held for, then given", async () => {
	const {lookups, NotReady, Picture, keyOf, overloadsOf} = await import("../src/given.ts")
	const url = "automerge:3DaNfqRoJixA3hFvEP26KgUUsKnh"
	const code = `doc("${url}").big ? s : g`
	// (not given: it's wanted, and the run's not ready)
	const wanted = new Map()
	assert.throws(() => compile(code, lookups({}, wanted))(0, 0, 0, 4, 4, 0), NotReady)
	assert.deepEqual([...wanted.values()], [{kind: "doc", url}])
	// (a block that catches it is still wanting it)
	const caught = new Map()
	assert.equal(compile(`try { doc("${url}") } catch { f }`, lookups({}, caught))(0, 0, 0, 4, 4, 0), Technique.FRONT)
	assert.equal(caught.size, 1)
	// (given: there it is)
	const given = {[keyOf({kind: "doc", url})]: {value: {big: true}}}
	assert.equal(compile(code, lookups(given, new Map()))(0, 0, 0, 4, 4, 0), Technique.SEED)
	// (couldn't be got: the block says why)
	const broken = {[keyOf({kind: "get", url: "https://x.test/a", as: "clever"})]: {error: "get(\"https://x.test/a\"): 404"}}
	assert.throws(() => compile(`get("https://x.test/a")`, lookups(broken, new Map()))(0, 0, 0, 4, 4, 0), /404/)
	assert.throws(() => compile(`get("https://x.test/a", "wat")`, lookups({}, new Map()))(0, 0, 0, 4, 4, 0), TypeError)
	// (a picture: its pixels, as a block wants them)
	const pixels = {width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255])}
	const pictured = {[keyOf({kind: "get", url: "https://x.test/p.png", as: "clever"})]: {value: pixels}}
	const light = compile(`get("https://x.test/p.png").light(x, 0)`, lookups(pictured, new Map()))
	assert.equal(light(0, 0, 0, 4, 4, 0), 0)
	assert.equal(light(1, 0, 0, 4, 4, 0), 1)
	assert.equal(light(9, 0, 0, 4, 4, 0), 1)
	assert.ok(new Picture(pixels).at(0, 0).every((v, i) => v === [0, 0, 0, 255][i]))
	// (and what each is, for the language server)
	const {doc, get} = overloadsOf({...given, ...pictured, ...broken})
	assert.deepEqual(doc, [`declare function doc(url: "${url}"): { "big": boolean; }`])
	assert.deepEqual(get, [`declare function get(url: "https://x.test/p.png", as?: "clever"): Picture`])
})
