// knitfold blocks, as a knitout.js pattern for lattice (src/lattice-sketch.ts)
//
//   node scripts/lattice.ts tiger.js > tiger.knitout.js
//   node scripts/lattice.ts first.js second.js --title scarf --colour '#ff48b0'
//   pbpaste | node scripts/lattice.ts - | pbcopy
//
// each file's a block's code (- is what's piped in), the first knitted
// first. --width and --height are a block's (64 and 64, as knitfold's are
// to start with), --title, --colour and --plating as the scarf's

import {readFileSync} from "node:fs"
import {basename, extname} from "node:path"
import {parseArgs} from "node:util"
import {latticeSketch} from "../src/lattice-sketch.ts"

const {values, positionals} = parseArgs({
	allowPositionals: true,
	options: {
		width: {type: "string", short: "w"},
		height: {type: "string", short: "h"},
		title: {type: "string"},
		colour: {type: "string"},
		plating: {type: "string"},
		help: {type: "boolean"},
	},
})

if (values.help || !positionals.length) {
	console.error("node scripts/lattice.ts block.js [more.js…] [--width 64] [--height 64] [--title t] [--colour c] [--plating c]   (- for stdin)")
	process.exit(values.help ? 0 : 1)
}

const size = (value: string | undefined, name: string) => {
	if (value == null) return undefined
	const n = Number(value)
	if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} is a whole number of stitches: not ${value}`)
	return n
}

const codes = positionals.map(path => readFileSync(path === "-" ? 0 : path, "utf8"))
process.stdout.write(
	latticeSketch(codes, {
		width: size(values.width, "width"),
		height: size(values.height, "height"),
		title: values.title ?? (positionals[0] === "-" ? undefined : basename(positionals[0], extname(positionals[0]))),
		colour: values.colour,
		plating: values.plating,
	}),
)
