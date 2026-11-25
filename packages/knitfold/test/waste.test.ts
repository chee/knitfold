import {test} from "node:test"
import assert from "node:assert/strict"
import {knitoutOf} from "../src/knitout.ts"
import {compile, gridOf} from "../src/stitches.ts"
import {knitoutToKcode} from "../src/vendor/kcode/knitout-to-kcode.js"

test("a waste section to start on: Agnes's, then the scarf from where it leaves things", () => {
	const k = knitoutOf([gridOf(compile("r1"), 24, 4)], {minNeedle: 10, waste: true})
	const lines = k.split("\n")
	// (her cast on, not knitfold's)
	assert.ok(!lines.includes("; cast on"))
	assert.ok(lines.includes("; waste section, Agnes Cameron's"))
	for (const line of ["in 3", "in 6", "in 1", "out 1", "out 6", "rack -0.5", "rack 0", "x-speed-number 400"]) assert.ok(lines.includes(line), line)
	// (no ;; headers after the headers)
	const firstOp = lines.indexOf("x-roller-advance 450")
	assert.ok(lines.slice(firstOp).every(line => !line.startsWith(";;")))
	// it ends with everything on the front bed, the yarn on the left: so the
	// plain rows start + from needle 10, and nothing's transferred first
	const plain = lines.indexOf("x-speed-number 450") + 2
	assert.equal(lines[plain - 1], "out 6")
	assert.equal(lines[plain], "knit + f10 3")
	// (and the kniterate's own)
	const kcode = (() => {
		const {log, warn} = console
		console.log = console.warn = () => {}
		try {
			return knitoutToKcode(k, "scarf.k", {})
		} finally {
			Object.assign(console, {log, warn})
		}
	})()
	assert.ok(kcode.length > 0)
})

test("no waste section unless it's asked for", () => {
	const lines = knitoutOf([gridOf(compile("f"), 4, 1)]).split("\n")
	assert.ok(lines.includes("; cast on"))
	assert.ok(!lines.includes("in 6"))
})
