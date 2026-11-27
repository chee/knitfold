/// <reference lib="webworker" />
// off the page's thread: the blocks' code run for every stitch (so a loop
// that never ends stops this worker, not the page), the scarf's knitout, and
// a block's yarn, relaxed as knitscape relaxes it, until it's settled

import {BlockError, compile, gridOf, Stitch, techniqueOf, type Grid} from "./stitches.ts"
import {lookups, NotReady, type Given, type Wanted} from "./given.ts"
import {Scarf} from "./knitout.ts"
import {runKnitoutBlock, stitchRows} from "./knitout-block.ts"
import {knitoutToKcode} from "./vendor/kcode/knitout-to-kcode.js"
import {programOf, readKnitout} from "./program.ts"
import {generateTopology} from "./vendor/knitscape/knitbit/simulation/topology.js"
import {computeYarnPathSpline, layoutNodes} from "./vendor/knitscape/knitbit/simulation/layout.js"
import {segmentsToPoints} from "./vendor/knitscape/shared/simulation/segments.js"
import {yarnRelaxation} from "./vendor/knitscape/shared/simulation/relaxation.js"
import {DEFAULT_RELAX_SETTINGS} from "./vendor/knitscape/shared/simulation/types.js"

/** a block's code: a stitch for each x and y (knitfold's own), or knitout.js */
export type BlockKind = "stitches" | "knitout"

export interface GridsRequest {
	type: "grids"
	id: number
	codes: string[]
	/** each code's kind (stitches, if it's not said) */
	kinds?: BlockKind[]
	width: number
	/** a stitches block's rows (a knitout.js block's are its own) */
	height: number
	/** the needle the first column's on */
	minNeedle?: number
	/** knitout.js for between each block and the next */
	between?: string
	/** start on Agnes Cameron's waste section (waste.ts) */
	waste?: boolean
	title: string
	colour: string
	plating: string | null
	/** t, in seconds */
	time: number
	/** the docs it's made from, pinned (see knitout.ts) */
	sources?: string[]
	/** what doc() and get() have got (given.ts) */
	given?: Given
}

// the scarf's .k as kcode, the kniterate's own: its first line, as lattice
// has a .kc's, the docs it was made from
export interface KcodeRequest {
	type: "kcode"
	id: number
	knitout: string
	name: string
	sources: string[]
}

// one stitch: what the block's code gives back there (the chart's hover)
export interface ValueRequest {
	type: "value"
	id: number
	code: string
	x: number
	y: number
	width: number
	height: number
	time: number
	given?: Given
}

export interface ValueResponse {
	type: "value"
	id: number
	/** what the code gave back, written out, as it was */
	value: string
	/** what that's read as (techniqueOf) */
	technique: number
	error: string | null
}

// a value, as it'd be written in the code: all of it (0.425 is 0.425, not
// the 0 it's knitted as: the hover says both)
function written(value: unknown): string {
	if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value)
	if (typeof value === "string") return JSON.stringify(value)
	if (typeof value === "function") return "a function"
	try {
		return String(value)
	} catch {
		return "?"
	}
}

export interface KcodeResponse {
	type: "kcode"
	id: number
	kcode: string
}

export interface BlockResult {
	/** width × height of them */
	stitches: Uint8Array
	techniques: Uint8Array
	/** its rows: the scarf's block height, or a knitout.js block's own */
	height: number
	/** a knitout.js block's ops, as they are in the .k */
	ops?: string[]
	error: {message: string; x?: number; y?: number; line?: number | null} | null
	/** it asked for something it hasn't got yet: plain till it has */
	pending?: boolean
}

export interface GridsResponse {
	type: "grids"
	id: number
	blocks: BlockResult[]
	knitout: string
	/** each block's lines in the .k, from 1: its first op's to its last's */
	lines: {start: number; end: number}[]
	/** what doc() and get() were asked for, and weren't given */
	wanted: Wanted[]
	/** the knitout.js for between blocks: what went wrong with it */
	betweenError?: string | null
	/** the waste section, if it starts on one: its rows, read back, and for
	 * each, 1 if it's the waste yarn's or the draw thread's */
	waste?: {height: number; stitches: Uint8Array; waste: Uint8Array} | null
	ms: number
}

export interface YarnRequest {
	type: "yarn"
	id: number
	/** the .k: the scarf's, or a block's */
	knitout: string
	/** settled as knitscape settles it, or (fast) just as it's laid out */
	relax: boolean
	/** with a second yarn through every loop, behind the first */
	plated: boolean
}

export interface Yarn {
	yarn: number
	/** the yarn's centre, through the points where it touches other yarn:
	 * x, y, z… (the drawing curves through them, close up) */
	points: Float32Array
	/** each point's bed: 1 the back bed's loops, 0 the front's (a plated
	 * loop shows its first yarn on the side it was knitted towards) */
	beds: Uint8Array
	/** the plating: the second yarn, behind the first */
	plating: boolean
}

export interface YarnResponse {
	type: "yarn"
	id: number
	yarns: Yarn[]
	diameter: number
	bounds: {minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number}
	/** where each block is, up the scarf: its lowest and highest yarn */
	bands: {minY: number; maxY: number}[]
	stitches: number
	ms: number
}

// knitscape's: a yarn's 0.27 of a stitch across, and the back bed's fabric
// a quarter of a stitch behind the front's. a stitch is 0.7 as tall as it's
// wide, as knitting is (more rows to the inch than stitches: 28 to 20, say),
// and as the stitches view and lattice's animation have them
const YARN_DIAMETER = 0.27
const PARAMS = {YARN_RADIUS: YARN_DIAMETER / 2, STITCH_WIDTH: 1, ASPECT: 0.7, BED_OFFSET: 0.25}
const MAX_TICKS = 400
// (a plating yarn's number: its yarn's, and this)
const PLATING = 100

// where each block is in the .k: from the line after its `; block N` to the
// last op before the next thing that isn't it
function linesOf(knitout: string, count: number) {
	const lines = knitout.split("\n")
	const found = Array.from({length: count}, () => ({start: 0, end: 0}))
	let current = -1
	lines.forEach((line, i) => {
		const marker = line.match(/^;\s*block (\d+)/)
		if (marker) {
			current = Number(marker[1]) - 1
			if (found[current]) found[current].start = i + 2
			return
		}
		if (/^;\s*(plain rows to finish|between blocks)/.test(line)) current = -1
		else if (found[current] && line && !line.startsWith(";")) found[current].end = i + 1
	})
	return found
}

async function grids(request: GridsRequest): Promise<GridsResponse> {
	const t0 = performance.now()
	const {width, height, minNeedle = 1} = request
	const plain = (): Grid => ({
		width,
		height,
		techniques: new Uint8Array(width * height),
		stitches: new Uint8Array(width * height).fill(Stitch.FRONT),
	})
	const results: BlockResult[] = []
	const wanted = new Map<string, Wanted>()
	const globals = lookups(request.given ?? {}, wanted)
	// the scarf, a part at a time: so each knitout.js part's run knowing where
	// everything is as it starts (its home() brings them back from there)
	const scarf = new Scarf(width, {
		title: request.title,
		colour: request.colour,
		plating: request.plating,
		sources: request.sources,
		minNeedle,
		waste: request.waste,
	})
	const knitoutJs = (code: string) =>
		runKnitoutBlock(code, {minNeedle, maxNeedle: minNeedle + width - 1, carrier: "3", start: scarf.loops.state(), globals})
	const failed = (error: {message: string; line: number | null}) => (error.line ? `${error.message} (on line ${error.line})` : error.message)
	// what goes between each block and the next: knitout.js, run in each gap,
	// as a knitout.js block is (its first error's said)
	let betweenError: string | null = null
	for (const [b, code] of request.codes.entries()) {
		if (b > 0 && request.between?.trim()) {
			const asked = wanted.size
			const run = await knitoutJs(request.between)
			if (wanted.size === asked) {
				scarf.between(run.ops)
				if (run.error) betweenError ??= failed(run.error)
			}
		}
		const asked = wanted.size
		if (request.kinds?.[b] === "knitout") {
			const run = await knitoutJs(code)
			// (it asked for something it hasn't got: nothing yet, till it has)
			const pending = wanted.size > asked
			const ops = pending ? [] : run.ops
			const rows = stitchRows(ops, minNeedle, width)
			scarf.block({ops})
			results.push({
				stitches: rows.stitches,
				techniques: new Uint8Array(0),
				height: rows.height,
				ops,
				error: pending || !run.error ? null : {message: failed(run.error), line: run.error.line},
				...(pending ? {pending: true} : {}),
			})
			continue
		}
		try {
			const grid = gridOf(compile(code, globals), width, height, request.time)
			// (it asked, and caught it: it's not what it'll be, yet)
			if (wanted.size > asked) throw new NotReady([...wanted.values()].at(-1)!)
			scarf.block(grid)
			results.push({stitches: grid.stitches, techniques: grid.techniques, height, error: null})
		} catch (error) {
			// (a block that doesn't run is knitted plain, so the scarf's
			// still the right length)
			const grid = plain()
			scarf.block(grid)
			if (wanted.size > asked) {
				results.push({stitches: grid.stitches, techniques: grid.techniques, height, error: null, pending: true})
				continue
			}
			const cause = error instanceof BlockError ? error.cause : error
			const name = cause instanceof Error ? cause.name : "Error"
			const message = error instanceof Error ? `${name}: ${error.message}` : String(error)
			results.push({
				stitches: grid.stitches,
				techniques: grid.techniques,
				height,
				error: error instanceof BlockError ? {message, x: error.x, y: error.y} : {message},
			})
		}
	}
	const knitout = scarf.finish()
	// (to be seen: the waste yarn's rows, and the draw thread's, in its colour)
	const wasteRows = request.waste ? stitchRows(scarf.wasteLines, minNeedle, width) : null
	const waste = wasteRows && {
		height: wasteRows.height,
		stitches: wasteRows.stitches,
		waste: Uint8Array.from(wasteRows.carriers, carrier => (carrier === "3" ? 0 : 1)),
	}
	return {type: "grids", id: request.id, blocks: results, knitout, lines: linesOf(knitout, request.codes.length), wanted: [...wanted.values()], betweenError, waste, ms: performance.now() - t0}
}

function yarn(request: YarnRequest): YarnResponse {
	const t0 = performance.now()
	// the whole scarf, as it's knitted
	const program = programOf(readKnitout(request.knitout))
	const topology = generateTopology(program, "compressed")
	const {nodes, nodeMap} = layoutNodes(topology, program, PARAMS)
	const segments = computeYarnPathSpline(topology, program, nodes, nodeMap, PARAMS)

	// where the yarn is, laid out, before it settles: what it settles into
	// is near there. (yarn with nowhere to settle — loops tucked and slipped
	// and never knitted — can fly off: it's left out of the drawing, beyond
	// a couple of stitches from here)
	const laid = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity}
	for (const node of nodes as {pos: number[]}[]) {
		const [x, y] = node.pos
		if (x < laid.minX) laid.minX = x
		if (x > laid.maxX) laid.maxX = x
		if (y < laid.minY) laid.minY = y
		if (y > laid.maxY) laid.maxY = y
	}
	// (a contact point's bed: the one its topology node's on)
	const bedOf = new Uint8Array(nodes.length)
	topology.nodes.forEach((node: {bed: string}, i: number) => {
		if (node.bed === "back") bedOf[nodeMap[i]] = 1
	})

	// plated: a second yarn through every loop, the same way as the first.
	// knitscape knits a row with one yarn; plating's two, fed together, one
	// in front of the other. so the first's moved half a yarn to the side
	// each loop faces (its face: towards the front for a loop on the front
	// bed, the back for the back bed's), and the plating half a yarn the
	// other way, through the same points. then they settle together
	if (request.plated) {
		const half = PARAMS.YARN_RADIUS / 2
		type Segment = {source: number; target: number; sourceOffset: number[]; targetOffset: number[]}
		const facing = (node: number) => (bedOf[node] ? -1 : 1)
		const moved = (offset: number[], node: number, side: number) => [offset[0], offset[1], offset[2] + side * facing(node) * half]
		for (const [key, segmentArr] of Object.entries(segments) as [string, Segment[]][]) {
			;(segments as Record<string, Segment[]>)[String(Number(key) + PLATING)] = segmentArr.map(segment => ({
				...segment,
				sourceOffset: moved(segment.sourceOffset, segment.source, -1),
				targetOffset: moved(segment.targetOffset, segment.target, -1),
			}))
			for (const segment of segmentArr) {
				segment.sourceOffset = moved(segment.sourceOffset, segment.source, 1)
				segment.targetOffset = moved(segment.targetOffset, segment.target, 1)
			}
		}
	}

	const SLACK = 2
	const within = (x: number, y: number) =>
		x >= laid.minX - SLACK && x <= laid.maxX + SLACK && y >= laid.minY - SLACK && y <= laid.maxY + SLACK

	if (request.relax) {
		const sim = yarnRelaxation({...DEFAULT_RELAX_SETTINGS})
		for (let tick = 0; sim.running() && tick < MAX_TICKS; tick++) sim.tick(segments, nodes)
	}

	const bounds = {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity}
	const yarns: Yarn[] = []
	for (const [key, segmentArr] of Object.entries(segments) as [string, {source: number; target: number}[]][]) {
		const points = new Float32Array(segmentsToPoints(segmentArr, nodes))
		if (points.length < 12) continue
		const beds = new Uint8Array(points.length / 3)
		segmentArr.forEach(({source, target}, s) => {
			beds[s * 2] = bedOf[source]
			beds[s * 2 + 1] = bedOf[target]
		})
		for (let i = 0; i < points.length; i += 3) {
			const x = points[i]
			const y = points[i + 1]
			const z = points[i + 2]
			if (!Number.isFinite(x + y + z) || !within(x, y)) {
				// (left out: the drawing skips a point that isn't a number)
				points[i] = NaN
				continue
			}
			if (x < bounds.minX) bounds.minX = x
			if (x > bounds.maxX) bounds.maxX = x
			if (y < bounds.minY) bounds.minY = y
			if (y > bounds.maxY) bounds.maxY = y
			if (z < bounds.minZ) bounds.minZ = z
			if (z > bounds.maxZ) bounds.maxZ = z
		}
		yarns.push({yarn: Number(key), points, beds, plating: Number(key) > PLATING})
	}
	// each block's band: where its rows' contact nodes ended up
	const count = program.blocks.reduce((most: number, b: number) => Math.max(most, b + 1), 0)
	const bands = Array.from({length: count}, () => ({minY: Infinity, maxY: -Infinity}))
	topology.nodes.forEach((node: {row: number}, i: number) => {
		const band = bands[program.blocks[node.row]]
		if (!band) return
		const [x, y] = nodes[nodeMap[i]].pos
		if (!Number.isFinite(x + y) || !within(x, y)) return
		if (y < band.minY) band.minY = y
		if (y > band.maxY) band.maxY = y
	})
	return {
		type: "yarn",
		id: request.id,
		yarns,
		diameter: YARN_DIAMETER,
		bounds,
		bands,
		stitches: program.width * program.height,
		ms: performance.now() - t0,
	}
}

self.onmessage = async (event: MessageEvent<GridsRequest | YarnRequest | KcodeRequest | ValueRequest>) => {
	const request = event.data
	try {
		if (request.type === "value") {
			const {code, x, y, width, height, time} = request
			let response: ValueResponse
			try {
				const value = compile(code, lookups(request.given ?? {}, new Map()))(x, y, x + y * width, width, height, time)
				response = {type: "value", id: request.id, value: written(value), technique: techniqueOf(value), error: null}
			} catch (error) {
				const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
				response = {type: "value", id: request.id, value: "", technique: 0, error: message}
			}
			self.postMessage(response)
			return
		}
		if (request.type === "kcode") {
			const comment = request.sources.length ? `// x-patchwork-sources ${request.sources.join(" ")}\n` : ""
			const kcode = comment + knitoutToKcode(request.knitout, request.name, {})
			self.postMessage({type: "kcode", id: request.id, kcode} satisfies KcodeResponse)
			return
		}
		if (request.type === "grids") {
			const response = await grids(request)
			const transfer = response.blocks.flatMap(block => [block.stitches.buffer, block.techniques.buffer])
			self.postMessage(response, transfer as Transferable[])
		} else if (request.type === "yarn") {
			const response = yarn(request)
			self.postMessage(
				response,
				response.yarns.map(yarn => yarn.points.buffer as ArrayBuffer),
			)
		}
	} catch (error) {
		self.postMessage({type: "error", id: request.id, message: error instanceof Error ? error.message : String(error)})
	}
}
