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
	assert.deepEqual(doc, [`declare function doc(url: "${url}"): { big: boolean; }`])
	assert.deepEqual(get, [`declare function get(url: "https://x.test/p.png", as?: "clever"): Picture`])
})

test("the little sums: and left off, the techniques' range", () => {
	const run = (code: string, x = 0, y = 0) => compile(code)(x, y, 0, 8, 8, 0)
	assert.equal(run("lerp(0.5)"), 3)
	assert.equal(run("lerp(0.25, 0, 100)"), 25)
	assert.equal(run("perl(3)"), 0.5)
	assert.equal(run("perl(5, 0, 10)"), 0.5)
	assert.equal(run("perl(5, 2, 2)"), 0)
	assert.equal(run("clamp(9)"), 6)
	assert.equal(run("clamp(-2)"), 0)
	assert.equal(run("clamp(5, 10, 0)"), 5)
	assert.equal(run("mod(-1)"), 6)
	assert.equal(run("mod(-1, 2)"), 1)
	assert.equal(run("mod(9, 7)"), 2)
	assert.equal(run("r2d(d2r(90))"), 90)
	assert.equal(run("d2r(180)"), Math.PI)
	// (an image's width, to the block's)
	assert.equal(run("remap(x, 0, w, 0, 640)", 4), 320)
	assert.equal(run("remap(20, 0, 10, 0, 1, true)"), 1)
	assert.equal(run("remap(0.5, 0, 1)"), 3)
	// (and as stitches: rounded to a technique)
	assert.equal(techniqueOf(compile("lerp(x / (w - 1))")(7, 0, 0, 8, 8, 0)), Technique.RIB3)
})

test("a doc's type: its names, and only that it has the rest", async () => {
	const {typeOf} = await import("../src/given.ts")
	assert.equal(
		typeOf({"@patchwork": {type: "patternwitch"}, width: 50, pixels: [[0, 1]], palette: ["#3d405b"]}),
		"{ [key: string]: unknown; width: number; pixels: number[][]; palette: string[]; }",
	)
	assert.equal(typeOf({a: {"my-key": 1, b: true}}), "{ a: { [key: string]: unknown; b: boolean; }; }")
})

test("and every function's, too", () => {
	const run = (code: string, x = 0, y = 0) => compile(code)(x, y, 0, 8, 8, 0)
	assert.equal(run("const pick = n => { if (n) {s} else {g} }\npick(x)", 1), Technique.SEED)
	assert.equal(run("const pick = n => { if (n) {s} else {g} }\npick(x)", 0), Technique.GARTER)
	assert.equal(run("function twice(n) { n * 2 }\ntwice(3)"), 6)
	assert.equal(run("const f = function () { let k = r2; k }\nf()"), Technique.RIB2)
	assert.equal(run("const o = { m() { 4 }, get g() { 5 } }\no.m() + o.g"), 9)
	assert.equal(run("class K { m() { 3 } }\nnew K().m()"), 3)
	// (a loop in a function: its own)
	assert.equal(run("function sum(n) { let t = 0; for (let i = 0; i <= n; i++) { t += i; t } }\nsum(3)"), 6)
	assert.equal(run("[1, 2, 3].map(n => { n * n }).at(-1)"), 9)
	// (a return of its own, still)
	assert.equal(run("function f(n) { if (n) return b\nf }\nf(1)"), Technique.BACK)
	// (not a constructor's: it'd be what new gives back. nor a setter's, a generator's)
	assert.equal(run("class K { constructor() { this.v = 2; ({}) } }\nnew K().v"), 2)
	assert.equal(run("const o = { set s(v) { this.v = v; 1 } }\no.s = 4\no.v"), 4)
	assert.equal(run("function* g() { 1 }\n[...g()].length"), 0)
})

test("a sound: what's at a moment, and how loud a pitch is", async () => {
	const {Sound, typeOf} = await import("../src/given.ts")
	// (a second of a 2kHz sine, half as loud as it could be)
	const sampleRate = 22050
	const samples = Float32Array.from({length: sampleRate}, (_, i) => 0.5 * Math.sin((2 * Math.PI * 2000 * i) / sampleRate))
	const sound = new Sound({sampleRate, samples})
	assert.equal(sound.duration, 1)
	assert.ok(Math.abs(sound.power(0.5, 2000) - 0.5) < 0.01, `2kHz: ${sound.power(0.5, 2000)}`)
	assert.ok(sound.power(0.5, 5000) < 0.01, `5kHz: ${sound.power(0.5, 5000)}`)
	// (past its end, quiet)
	assert.equal(sound.power(3, 2000), 0)
	assert.equal(typeOf({sampleRate, samples}), "Sound")
})

test("a top-level const is once: a let's every stitch's", () => {
	let made = 0
	const globals = {count: () => (made++, 7)}
	const fn = compile("const k = count()\nlet j = x\nk + j", globals)
	assert.equal(fn(1, 0, 0, 4, 4, 0), 8)
	assert.equal(fn(2, 0, 0, 4, 4, 0), 9)
	assert.equal(made, 1)
	// (each run its own)
	compile("const k = count()\nk", globals)(0, 0, 0, 4, 4, 0)
	assert.equal(made, 2)
	// (a let's, every stitch)
	made = 0
	const each = compile("let k = count()\nk", globals)
	each(0, 0, 0, 4, 4, 0), each(1, 0, 0, 4, 4, 0)
	assert.equal(made, 2)
	// (a const that says the stitch, or a let, or something that does: every
	// stitch's, as before)
	const px = compile("const px = x * 2\npx")
	assert.equal(px(1, 0, 0, 4, 4, 0), 2)
	assert.equal(px(3, 0, 0, 4, 4, 0), 6)
	const via = compile("let a = y\nconst b = a + 1\nconst c = b * 10\nc")
	assert.equal(via(0, 1, 0, 4, 4, 0), 20)
	assert.equal(via(0, 2, 0, 4, 4, 0), 30)
	const fnOf = compile("function at() { return i }\nconst v = at()\nv")
	assert.equal(fnOf(0, 0, 5, 4, 4, 0), 5)
	assert.equal(fnOf(0, 0, 6, 4, 4, 0), 6)
	// (a const's thing, kept: the same array for every stitch)
	const shared = compile("const seen = []\nseen.push(x)\nseen.length")
	assert.equal(shared(0, 0, 0, 4, 4, 0), 1)
	assert.equal(shared(1, 0, 0, 4, 4, 0), 2)
	// (inside a function or a block, a const's as it always was)
	const inner = compile("let f = () => { const k = count(); k }\nf() + f()", globals)
	made = 0
	inner(0, 0, 0, 4, 4, 0)
	assert.equal(made, 2)
	// (destructured, and several at once)
	assert.equal(compile("const {a, b} = {a: 1, b: 2}, c = a + b\nc + x")(1, 0, 0, 4, 4, 0), 4)
})
