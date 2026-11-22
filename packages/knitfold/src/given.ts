// what a block's code can ask for from outside it: `doc(url)`, an automerge
// doc's value, and `get(url, as)`, what's at a url. a block's run for every
// stitch, and can't wait: so they're held for. the first time a run asks for
// one it isn't given, it's noted, and the run says NotReady (the block's
// knitted plain); the page gets it (fetcher.ts), gives it to the next run,
// and runs it again. so a block's code just says `doc(url).width`, no await.
//
// this is the part the worker and the page both need: what's asked for, what
// it's called, and what it's like (for the language server's types)

export type GetAs = "bytes" | "text" | "json" | "clever"
export const GET_AS: GetAs[] = ["bytes", "text", "json", "clever"]

export type Wanted = {kind: "doc"; url: string} | {kind: "get"; url: string; as: GetAs}

export const keyOf = (wanted: Wanted) => (wanted.kind === "doc" ? `doc ${wanted.url}` : `get ${wanted.as} ${wanted.url}`)

/** what's been got, by key: its value, or why it couldn't be */
export type Given = Record<string, {value: unknown} | {error: string}>

export class NotReady extends Error {
	wanted: Wanted
	constructor(wanted: Wanted) {
		super(`still getting ${wanted.url}`)
		this.name = "NotReady"
		this.wanted = wanted
	}
}

// a picture's pixels (an image, got clever-ly), as a block wants them: what
// colour's at x, y, and how light. x and y are the picture's own (0, 0 at
// its top left), and past its edges it's its edges
export class Picture {
	readonly width: number
	readonly height: number
	readonly data: Uint8ClampedArray
	constructor(image: {width: number; height: number; data: Uint8ClampedArray}) {
		this.width = image.width
		this.height = image.height
		this.data = image.data
	}
	#index(x: number, y: number) {
		const px = Math.min(this.width - 1, Math.max(0, Math.floor(x)))
		const py = Math.min(this.height - 1, Math.max(0, Math.floor(y)))
		return (px + py * this.width) * 4
	}
	/** [red, green, blue, alpha], each 0 to 255 */
	at(x: number, y: number): [number, number, number, number] {
		const i = this.#index(x, y)
		return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]
	}
	/** how light it is, 0 (black) to 1 (white): see-through is white */
	light(x: number, y: number) {
		const [r, g, b, a] = this.at(x, y)
		// (in whole numbers: so white's 1, not nearly)
		const lum = (2126 * r + 7152 * g + 722 * b) / 2_550_000
		return lum * (a / 255) + (1 - a / 255)
	}
}

// a sound (got clever-ly): its samples, one channel, and how many a second.
// what's at a moment, and how loud a pitch is there (a spectrogram's a
// power for each moment and pitch)
export class Sound {
	readonly sampleRate: number
	readonly samples: Float32Array
	constructor(sound: {sampleRate: number; samples: Float32Array}) {
		this.sampleRate = sound.sampleRate
		this.samples = sound.samples
	}
	/** how long it is, in seconds */
	get duration() {
		return this.samples.length / this.sampleRate
	}
	/** the sample at a moment (in seconds): -1 to 1 */
	at(seconds: number) {
		return this.samples[Math.floor(seconds * this.sampleRate)] ?? 0
	}
	/** how loud hz is around a moment (in seconds), 0 to 1: a sine that
	 * fills the sound's 1. listened for over `window` samples (more hears
	 * pitches apart better, fewer moments) */
	power(seconds: number, hz: number, window = 1024) {
		// (goertzel's: one pitch's, not all of them, as an fft would)
		const start = Math.floor(seconds * this.sampleRate - window / 2)
		const k = (2 * Math.PI * hz) / this.sampleRate
		const coefficient = 2 * Math.cos(k)
		let s1 = 0
		let s2 = 0
		let weights = 0
		for (let n = 0; n < window; n++) {
			// (hann's window: so the edges don't ring)
			const weight = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (window - 1))
			weights += weight
			const s0 = (this.samples[start + n] ?? 0) * weight + coefficient * s1 - s2
			s2 = s1
			s1 = s0
		}
		const real = s1 - s2 * Math.cos(k)
		const imaginary = s2 * Math.sin(k)
		return (2 * Math.hypot(real, imaginary)) / weights
	}
}

const isSoundData = (value: unknown): value is {sampleRate: number; samples: Float32Array} =>
	!!value &&
	typeof value === "object" &&
	(value as {samples?: unknown}).samples instanceof Float32Array &&
	typeof (value as {sampleRate?: unknown}).sampleRate === "number"

const isImageData = (value: unknown): value is {width: number; height: number; data: Uint8ClampedArray} =>
	!!value &&
	typeof value === "object" &&
	(value as {data?: unknown}).data instanceof Uint8ClampedArray &&
	typeof (value as {width?: unknown}).width === "number"

// a run's doc() and get(): from what it's given. anything it isn't is noted
// in `wanted` (a block can catch NotReady, so the throw alone can't be
// trusted to say so)
export function lookups(given: Given, wanted: Map<string, Wanted>) {
	const made = new Map<string, unknown>()
	function look(asked: Wanted) {
		const key = keyOf(asked)
		if (made.has(key)) return made.get(key)
		const got = given[key]
		if (!got) {
			wanted.set(key, asked)
			throw new NotReady(asked)
		}
		if ("error" in got) throw new Error(got.error)
		const value = isImageData(got.value) ? new Picture(got.value) : isSoundData(got.value) ? new Sound(got.value) : got.value
		made.set(key, value)
		return value
	}
	return {
		doc(url: unknown) {
			if (typeof url !== "string") throw new TypeError("doc(url): the url's a string, automerge:…")
			return look({kind: "doc", url})
		},
		get(url: unknown, as: unknown = "clever") {
			if (typeof url !== "string") throw new TypeError("get(url): the url's a string")
			if (!GET_AS.includes(as as GetAs)) throw new TypeError(`get(url, as): as is ${GET_AS.map(a => `"${a}"`).join(", ")}`)
			return look({kind: "get", url, as: as as GetAs})
		},
	}
}

// ── what it's like: a value as a typescript type, for the language server.
// a list is its first element's type; a map's keys always quoted. past
// `depth`, unknown (as lattice's doc-types.js)

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

export function typeOf(value: unknown, depth = 4): string {
	if (value === null || value === undefined) return "null"
	if (typeof value === "string") return "string"
	if (typeof value === "number") return "number"
	if (typeof value === "boolean") return "boolean"
	if (value instanceof Uint8Array) return "Uint8Array"
	if (value instanceof Date) return "Date"
	if (value instanceof Picture || isImageData(value)) return "Picture"
	if (value instanceof Sound || isSoundData(value)) return "Sound"
	if (Array.isArray(value)) {
		if (depth <= 0) return "unknown[]"
		if (!value.length) return "unknown[]"
		return `${typeOf(value[0], depth - 1)}[]`
	}
	if (typeof value === "object") {
		if (depth <= 0) return "unknown"
		const fields = Object.entries(value).filter(([, field]) => field !== undefined)
		if (!fields.length) return "{}"
		// (a key that isn't a name, "@patchwork" say, is only said to be
		// there: the editor's completions take one such, completed as
		// `["@patchwork"]` from the dot, to be what all of them complete from,
		// and so offer nothing else. it's still there to be asked for, as
		// crab["@patchwork"], just not what it is)
		const named = fields.filter(([key]) => IDENTIFIER.test(key))
		const others = named.length < fields.length ? "[key: string]: unknown; " : ""
		return `{ ${others}${named.map(([key, field]) => `${key}: ${typeOf(field, depth - 1)}; `).join("")}}`
	}
	return "unknown"
}

// what the language server's told of each thing got: an overload of doc()
// or get() for its own url, saying what it is. (these go before the
// general ones, declarations.ts, so they're the ones it picks)
export function overloadsOf(given: Given) {
	const doc: string[] = []
	const get: string[] = []
	for (const [key, got] of Object.entries(given)) {
		if (!("value" in got)) continue
		const type = typeOf(got.value)
		const [kind, ...rest] = key.split(" ")
		if (kind === "doc") {
			doc.push(`declare function doc(url: ${JSON.stringify(rest.join(" "))}): ${type}`)
		} else {
			const [as, ...url] = rest
			const at = JSON.stringify(url.join(" "))
			if (as === "clever") get.push(`declare function get(url: ${at}, as?: "clever"): ${type}`)
			else get.push(`declare function get(url: ${at}, as: ${JSON.stringify(as)}): ${type}`)
		}
	}
	return {doc, get}
}
