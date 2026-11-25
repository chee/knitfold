import {test} from "node:test"
import assert from "node:assert/strict"
import {compile, gridOf} from "../src/stitches.ts"
import {knitoutOf} from "../src/knitout.ts"
import {latticeSketch} from "../src/lattice-sketch.ts"

// knitout.js's Writer, as far as a sketch uses it: each op a line
class Writer {
	headers: string[]
	ops: string[] = []
	constructor({carriers}: {carriers: string[]}) {
		this.headers = [`;;Carriers: ${carriers.join(" ")}`]
	}
	addHeader(name: string, value: string) {
		this.headers.push(`;;${name}: ${value}`)
	}
	comment(text: string) {
		this.ops.push(`;${text}`)
	}
	in(c: string) {
		this.ops.push(`in ${c}`)
	}
	out(c: string) {
		this.ops.push(`out ${c}`)
	}
	knit(dir: string, n: string, ...cs: string[]) {
		this.ops.push(`knit ${dir} ${n} ${cs.join(" ")}`)
	}
	tuck(dir: string, n: string, ...cs: string[]) {
		this.ops.push(`tuck ${dir} ${n} ${cs.join(" ")}`)
	}
	xfer(from: string, to: string) {
		this.ops.push(`xfer ${from} ${to}`)
	}
}

type Lattice = {doc?: (url: string) => unknown; get?: (url: string, as?: string) => unknown}

// run as lattice runs a pattern: strict, its imports of knitout and lattice
// swapped for what they are (as lattice's instrument.js does)
function run(sketch: string, lattice: Lattice = {}) {
	let writer: Writer | undefined
	const knitout = {
		Writer: class extends Writer {
			constructor(options: {carriers: string[]}) {
				super(options)
				writer = this
			}
		},
	}
	const imports = /^import \{doc, get\} from "lattice"\nimport knitout from "knitout"$/m
	assert.match(sketch, imports)
	const code = sketch.replace(imports, "const {doc, get} = __lattice\nconst knitout = __knitout")
	const none = () => assert.fail("nothing's got here")
	new Function("__lattice", "__knitout", `"use strict";\n${code}`)({doc: none, get: none, ...lattice}, knitout)
	return writer!
}

const opsOf = (knitout: string) => knitout.split("\n").filter(line => line && !line.startsWith(";;") && !line.startsWith(";!") && !line.startsWith("x-"))

function same(codes: string[], width: number, height: number, lattice: Lattice = {}) {
	const writer = run(latticeSketch(codes, {width, height, title: "same"}), lattice)
	const globals = lattice
	const grids = codes.map(code => gridOf(compile(code, globals), width, height))
	assert.deepEqual(writer.ops, opsOf(knitoutOf(grids, {title: "same"})))
}

const TIGER = `// put a tiger in your tank too

let sox = ((x+.5)/w*2)/2 - .5
let soy = ((y+.5)/h*2)/2 -.5
let axe = d2r(13)
let rox = sox * cos(axe) + soy * sin(axe)
let roy = soy * cos(axe) + sox * sin(axe)
let pie = .38
let without = .22
function spiral(s, fox, foy) {
    let dox = s*(rox-fox)
    let doy = s*(soy-foy)
    let ooo = hypot(dox, doy)
    for (let rabbits = mod(atan2(dox, doy) / (2*PI), 1); rabbits < 3; rabbits++) {
        if (rabbits<0.56) continue
        let oink = pie+rabbits*(without-pie)
        let meow = .01+.04*perl(rabbits,.35,2)
        if (abs(ooo-oink)<meow) return 1
    }
    0
}
spiral(1, 0, .2) || spiral(-1, 0, -.2) ? 1 : hypot(w-x-50, h-y-50) > 40 ? s : b

// rec from agnes is put a couple of wales of seed/garter/rib
//at either side to stop it from rolling in on itself`

const CRAB = `// throwback crab
const crab = doc("automerge:2f5SBhz3BGAvK9devhWbJHGiugyA")
const sx = floor(remap(x, 0, w, 0, crab.width))
const sy = floor(remap(h - y, 0, h, 0, crab.height))
const colors = [f, b, g, s]
colors[crab.pixels[sy]?.[sx]]`

test("a sketch writes the .k knitfold does", () => {
	same([TIGER], 64, 64)
	same(["x % 2 ? r : f", "g", "if (y > 3) {s} else {r2}", ""], 12, 8)
	// (a loop's last value, and a function's, with no return)
	same(["let k = f\nfor (let n = 0; n < x; n++) k = n % 3 ? g : s\nk", "const pick = n => { if (n) {b} else {f} }\npick(x % 2)"], 9, 5)
})

test("a block that reads a doc, through lattice's doc()", () => {
	const pixels = Array.from({length: 10}, (_, y) => Array.from({length: 10}, (_, x) => (x * y) % 4))
	let reads = 0
	const doc = (url: string) => {
		assert.equal(url, "automerge:2f5SBhz3BGAvK9devhWbJHGiugyA")
		reads++
		return {width: 10, height: 10, pixels}
	}
	same([CRAB], 20, 16, {doc})
	// (a const that's the same for every stitch is worked out once)
	reads = 0
	run(latticeSketch([CRAB], {width: 20, height: 16}), {doc})
	assert.equal(reads, 1)
})

test("a block that reads a picture, through lattice's get()", () => {
	const picture = {light: (x: number, y: number) => ((x + y) % 3) / 2}
	const get = (url: string, as = "clever") => {
		assert.equal(url, "https://x.test/p.png")
		assert.equal(as, "clever")
		return picture
	}
	same([`get("https://x.test/p.png").light(x, y) > 0.5 ? f : s`], 12, 6, {get})
})

test("its headers: the machine, and the yarn", () => {
	const writer = run(latticeSketch(["f"], {width: 4, height: 2, colour: "#ff48b0", plating: "#f3e9dc"}))
	assert.deepEqual(writer.headers, [
		";;Carriers: 1 2 3 4 5 6",
		";;Machine: kniterate",
		";;Position: Keep",
		";;Yarn-3: #ff48b0 plated with #f3e9dc",
	])
})
