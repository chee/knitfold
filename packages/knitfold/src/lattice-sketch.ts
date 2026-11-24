import {withCompletion} from "./completion.ts"
import {withConstants} from "./constants.ts"

// knitfold blocks as a knitout.js pattern for lattice: one .js that writes
// the .k knitfold would. each block's code goes in as knitfold reads it (a
// return before what it ends on; a top-level const that's the same for every
// stitch, worked out once), as a function of the stitch. after them,
// knitfold's knitting, written out: what a block's given (Math, the
// techniques' names, its sums), what a technique is where it is, and the
// scarf (a cast on, a couple of plain rows, each block's rows, a couple more)
//
// lattice runs a pattern in strict mode with no `with`: so Math's names are
// taken out of Math, and a name a block sets without saying let or const
// (`n = 3`) is an error there, where it wasn't in knitfold. `doc(url)` is
// lattice's own, and does what knitfold's does; `get(url)` isn't there

export interface SketchOptions {
	/** stitches across, every block */
	width?: number
	/** rows in a block */
	height?: number
	title?: string
	/** the ;;Yarn-<carrier>: colour */
	colour?: string | null
	/** and what it's plated with */
	plating?: string | null
	carrier?: string
	/** the needle the first column is on */
	minNeedle?: number
	/** plain rows before the first block and after the last */
	plainRows?: number
}

const ONCE = "__knitfold_once"

// a block's code as the body of a function of the stitch, as compile
// (stitches.ts) reads it: an expression, or statements that end on one
export function blockBody(code: string) {
	const trimmed = code.trim()
	if (!trimmed) return "return f"
	const expression = `return (${withCompletion(trimmed, {top: false}).replace(/;\s*$/, "")}\n)`
	try {
		new Function(expression)
		return expression
	} catch {
		return withCompletion(withConstants(code))
	}
}

function blockFunction(code: string, n: number) {
	const body = blockBody(code).replace(/\s+$/, "")
	const head = `// ── block ${n}`
	if (!body.includes(ONCE)) return `${head}\nfunction block${n}(x, y, i, w, h, t, col = x, row = y) {\n${body}\n}`
	return [
		head,
		`// (a ${ONCE}(n, …) is a const worked out the first time, and kept)`,
		`const block${n} = (() => {`,
		`const kept = new Map()`,
		`const ${ONCE} = (n, make) => (kept.has(n) || kept.set(n, make()), kept.get(n))`,
		`return function block${n}(x, y, i, w, h, t, col = x, row = y) {`,
		body,
		`}`,
		`})()`,
	].join("\n")
}

const MATH = Object.getOwnPropertyNames(Math).filter(name => /^[A-Za-z]\w*$/.test(name))

const GIVEN = `// ── what knitfold gives a block: Math, the techniques' names, its sums
const {${MATH.join(", ")}} = Math
// 0 back, 1 front, then the patterns: 2 garter, 3 seed, 4 1×1 rib, 5 2×2
// rib, 6 1×2 rib (and the old capitals)
const b = 0, f = 1, g = 2, s = 3, r = 4, r1 = 4, r2 = 5, r3 = 6
const BACK = 0, FRONT = 1, GARTER = 2, SEED = 3, RIB = 4, RIB2 = 5, RIB3 = 6
const NAMES = {b, f, g, s, r, r1, r2, r3, BACK, FRONT, GARTER, SEED, RIB, RIB2, RIB3}
const lerp = (t, min = 0, max = 6) => min * (1 - t) + max * t
const perl = (value, min = 0, max = 6) => (abs(min - max) < Number.EPSILON ? 0 : (value - min) / (max - min))
const clamp = (value, min = 0, max = 6) => (min < max ? Math.min(max, Math.max(min, value)) : Math.min(min, Math.max(max, value)))
const mod = (a, n = 7) => ((a % n) + n) % n
const d2r = degrees => (degrees * PI) / 180
const r2d = radians => (radians * 180) / PI
const remap = (value, inMin, inMax, outMin = 0, outMax = 6, clamped = false) => {
	const out = lerp(perl(value, inMin, inMax), outMin, outMax)
	return clamped ? clamp(out, outMin, outMax) : out
}`

const KNITTING = `// ── knitfold's knitting

// what a block gave back, as a technique: true's front, false back, a name
// its technique; nothing, or anything else, front
function techniqueOf(value) {
	if (value === true) return FRONT
	if (value === false) return BACK
	if (typeof value === "string") return NAMES[value] ?? NAMES[value.toUpperCase()] ?? FRONT
	if (typeof value !== "number" || !Number.isFinite(value)) return FRONT
	const n = Math.round(value)
	return n >= 0 && n <= RIB3 ? n : FRONT
}

// a technique, where it is: the bed that needle knits on that row
function bedOf(technique, x, y) {
	switch (technique) {
		case FRONT: return "f"
		case GARTER: return y % 2 === 0 ? "f" : "b"
		case SEED: return (x + y) % 2 === 0 ? "f" : "b"
		case RIB: return x % 2 === 0 ? "f" : "b"
		case RIB2: return Math.floor(x / 2) % 2 === 0 ? "f" : "b"
		case RIB3: return x % 3 === 0 ? "f" : "b"
		default: return "b"
	}
}

// a block, run for every stitch (t at 0, as knitfold knits it): each row's
// beds, the first knitted first
function rowsOf(block) {
	const rows = []
	for (let y = 0; y < height; y++) {
		const row = []
		for (let x = 0; x < width; x++) row.push(bedOf(techniqueOf(block(x, y, x + y * width, width, height, 0)), x, y))
		rows.push(row)
	}
	return rows
}

const needles = Array.from({length: width}, (_, x) => minNeedle + x)
// where each needle's loop is
const loops = needles.map(() => "f")
let dir = "+"
const across = () => (dir === "+" ? needles.map((_, x) => x) : needles.map((_, x) => width - 1 - x))
const turn = () => (dir = dir === "+" ? "-" : "+")

// a row: a transfer for each loop that changes beds, then the row knitted
function row(beds) {
	for (const x of across()) {
		if (beds[x] === loops[x]) continue
		k.xfer(loops[x] + needles[x], beds[x] + needles[x])
		loops[x] = beds[x]
	}
	for (const x of across()) k.knit(dir, loops[x] + needles[x], carrier)
	turn()
}
const plain = needles.map(() => "f")

k.in(carrier)
// cast on: every other needle tucked going, the others coming back
k.comment(" cast on")
for (const x of across()) if (x % 2 === 0) k.tuck(dir, "f" + needles[x], carrier)
turn()
for (const x of across()) if (x % 2 === 1) k.tuck(dir, "f" + needles[x], carrier)
turn()
for (let n = 0; n < plainRows; n++) row(plain)

blocks.forEach((block, n) => {
	k.comment(\` block \${n + 1}\`)
	for (const beds of rowsOf(block)) row(beds)
})

k.comment(" plain rows to finish")
for (let n = 0; n < plainRows; n++) row(plain)
// (no bind off: it comes off the machine held by these rows)
k.out(carrier)`

export function latticeSketch(codes: string[], options: SketchOptions = {}) {
	const {width = 64, height = 64, title = "knitfold", colour = null, plating = null, carrier = "1", minNeedle = 1, plainRows = 2} = options
	const name = title.replace(/\n/g, " ")
	const yarn = colour ? `${colour}${plating ? ` plated with ${plating}` : ""}` : null
	const blocks = codes.map((code, n) => blockFunction(code, n + 1))
	return [
		`// ${name}, from knitfold: ${codes.length} block${codes.length === 1 ? "" : "s"}, ${width} stitches across and ${height} rows each,`,
		`// the first block knitted first. each block's code is as knitfold reads it;`,
		`// the rest is knitfold's, so this writes the .k knitfold would`,
		`const knitout = require("knitout")`,
		`const k = new knitout.Writer({carriers: ["1", "2", "3", "4", "5", "6"]})`,
		`k.addHeader("Machine", "kniterate")`,
		`k.addHeader("Position", "Keep")`,
		...(yarn ? [`k.addHeader(${JSON.stringify(`Yarn-${carrier}`)}, ${JSON.stringify(yarn)})`] : []),
		`k.comment(${JSON.stringify(` ${name}, from knitfold`)})`,
		``,
		`const width = ${width}`,
		`const height = ${height}`,
		`const carrier = ${JSON.stringify(carrier)}`,
		`const minNeedle = ${minNeedle}`,
		`const plainRows = ${plainRows}`,
		``,
		GIVEN,
		``,
		...blocks.flatMap(block => [block, ``]),
		`const blocks = [${codes.map((_, n) => `block${n + 1}`).join(", ")}]`,
		``,
		KNITTING,
		``,
	].join("\n")
}
