import {isValidAutomergeUrl, type AutomergeUrl} from "@automerge/automerge-repo"
import {createMemo, createSignal} from "solid-js"
import {findPatiently} from "./find.ts"
import {keyOf, type GetAs, type Given, type Wanted} from "./given.ts"

// the page's side of doc() and get() (given.ts): what a run wanted, got. a
// doc's found (and found again till it is), and kept up with: it changes,
// and the blocks are run again with it. a get's fetched once, and made what
// it's asked to be (or, clever, what it looks like it ought to be)

/** something being got, and how far it's got */
export interface Fetching {
	/** what it is, short: a url's host and path, a doc's url */
	label: string
	/** looking for a doc; fetching what's at a url; or making a sound or a
	 * picture of what's been fetched */
	phase: "finding" | "fetching" | "decoding"
	/** bytes fetched so far, and of how many (if it said) */
	received: number
	total: number | null
}

export function fetcher() {
	const [given, setGiven] = createSignal<Given>({})
	// (what's being got, not got yet, and how far: shown as it goes)
	const [progress, setProgress] = createSignal<Readonly<Record<string, Fetching>>>({})
	const loading = createMemo<ReadonlySet<string>>(() => new Set(Object.keys(progress())))
	const started = new Map<string, () => void>()
	let stopped = false

	const update = (key: string, change: Partial<Fetching>) =>
		setProgress(all => (all[key] ? {...all, [key]: {...all[key], ...change}} : all))
	const settle = (key: string, got: Given[string]) => {
		setGiven(all => ({...all, [key]: got}))
		setProgress(all => {
			if (!all[key]) return all
			const {[key]: _, ...rest} = all
			return rest
		})
	}

	function want(list: Wanted[]) {
		for (const wanted of list) {
			const key = keyOf(wanted)
			if (started.has(key) || stopped) continue
			started.set(key, () => {})
			const label = wanted.kind === "doc" ? wanted.url : shortUrl(wanted.url)
			setProgress(all => ({...all, [key]: {label, phase: wanted.kind === "doc" ? "finding" : "fetching", received: 0, total: null}}))
			if (wanted.kind === "doc") getDoc(key, wanted.url)
			else getUrl(key, wanted.url, wanted.as)
		}
	}

	function getDoc(key: string, url: string) {
		if (!isValidAutomergeUrl(url)) {
			settle(key, {error: `doc(${JSON.stringify(url)}): that's not an automerge url`})
			return
		}
		findPatiently<unknown>(url as AutomergeUrl, {gone: () => stopped || !started.has(key)}).then(handle => {
			if (!handle || stopped) return
			const read = () => settle(key, {value: plain(handle.doc())})
			handle.on("change", read)
			started.set(key, () => handle.off("change", read))
			read()
		})
	}

	function getUrl(key: string, url: string, as: GetAs) {
		const what = `get(${JSON.stringify(url)}${as === "clever" ? "" : `, ${JSON.stringify(as)}`})`
		let address: URL
		try {
			address = new URL(url, location.href)
		} catch {
			settle(key, {error: `${what}: that's not a url`})
			return
		}
		fetch(address)
			.then(async response => {
				if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
				const fetched = await readAll(response, (received, total) => update(key, {received, total}))
				const type = response.headers.get("content-type") ?? ""
				if (as === "clever" && /^(audio|image)\/|application\/ogg/.test(type)) update(key, {phase: "decoding"})
				return decode(fetched, as)
			})
			.then(
				value => stopped || settle(key, {value}),
				error => stopped || settle(key, {error: `${what}: ${error instanceof Error ? error.message : String(error)}`}),
			)
	}

	return {
		/** what's been got, to give the blocks' runs */
		given,
		/** what's still being got */
		loading,
		/** and how far each's got */
		progress,
		/** what a run wanted (and hadn't got) */
		want,
		stop() {
			stopped = true
			for (const off of started.values()) off()
			started.clear()
		},
	}
}

// a response's body, all of it, saying how much has come as it comes (a
// few times a second), as a response again to be read as it's asked to be
async function readAll(response: Response, saying: (received: number, total: number | null) => void) {
	const length = Number(response.headers.get("content-length"))
	const total = Number.isFinite(length) && length > 0 ? length : null
	if (!response.body) return response
	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let received = 0
	let said = 0
	for (;;) {
		const {done, value} = await reader.read()
		if (done) break
		chunks.push(value)
		received += value.length
		if (performance.now() - said > 150) {
			said = performance.now()
			saying(received, total)
		}
	}
	saying(received, total)
	return new Response(new Blob(chunks as BlobPart[]), {status: response.status, headers: response.headers})
}

// a url, short: its host (without www.) and path
export function shortUrl(url: string) {
	try {
		const {host, pathname, protocol} = new URL(url, location.href)
		if (protocol === "data:") return "data:…"
		return `${host.replace(/^www\./, "")}${pathname === "/" ? "" : pathname}`
	} catch {
		return url
	}
}

// ── a response, as it's asked to be

const decoder = (fatal = false) => new TextDecoder("utf-8", {fatal})

async function decode(response: Response, as: GetAs): Promise<unknown> {
	if (as === "bytes") return new Uint8Array(await response.arrayBuffer())
	if (as === "text") return response.text()
	if (as === "json") return response.json()
	// clever: what its type says it is
	const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
	if (type === "application/json" || type.endsWith("+json")) return response.json()
	if (type.startsWith("image/")) return pixelsOf(await response.blob())
	if (type.startsWith("audio/") || type === "application/ogg") return soundOf(await response.arrayBuffer())
	if (type === "text/csv") return rowsOf(await response.text(), ",")
	if (type === "text/tab-separated-values") return rowsOf(await response.text(), "\t")
	if (type.startsWith("text/") || type.endsWith("+xml") || type === "application/xml" || type.includes("javascript")) {
		return response.text()
	}
	// (or, if it doesn't say: what it looks like. text that's json is json,
	// other text is text; anything else, its bytes)
	const bytes = new Uint8Array(await response.arrayBuffer())
	if (type && type !== "application/octet-stream") return bytes
	let text: string
	try {
		text = decoder(true).decode(bytes)
	} catch {
		return bytes
	}
	if (/^\s*[[{]/.test(text)) {
		try {
			return JSON.parse(text)
		} catch {
			// (it's text, then)
		}
	}
	return text
}

// an image's pixels (an ImageData: it goes to the worker as it is, and the
// worker makes a Picture of it)
async function pixelsOf(blob: Blob): Promise<ImageData> {
	let image: CanvasImageSource & {width: number; height: number}
	try {
		image = await createImageBitmap(blob)
	} catch {
		// (an svg: createImageBitmap won't, an <img> will)
		const element = new Image()
		element.src = URL.createObjectURL(blob)
		await element.decode()
		URL.revokeObjectURL(element.src)
		image = element
	}
	const width = image.width || 1
	const height = image.height || 1
	const canvas = new OffscreenCanvas(width, height)
	const context = canvas.getContext("2d")!
	context.drawImage(image, 0, 0, width, height)
	return context.getImageData(0, 0, width, height)
}

// a sound's samples, one channel (its channels, together), at SAMPLE_RATE:
// up to 11kHz, all a bird sings. (an object of plain things, so it goes to
// the worker as it is, and the worker makes a Sound of it)
const SAMPLE_RATE = 22_050
async function soundOf(bytes: ArrayBuffer) {
	const decoded = await new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(bytes)
	const samples = new Float32Array(decoded.length)
	for (let c = 0; c < decoded.numberOfChannels; c++) {
		const channel = decoded.getChannelData(c)
		for (let i = 0; i < channel.length; i++) samples[i] += channel[i] / decoded.numberOfChannels
	}
	return {sampleRate: decoded.sampleRate, samples}
}

// a csv's rows, each its cells (quoted cells as they are, "" for a ")
function rowsOf(text: string, separator: string) {
	const rows: string[][] = []
	let row: string[] = []
	let cell = ""
	let quoted = false
	for (let i = 0; i < text.length; i++) {
		const c = text[i]
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') (cell += '"'), i++
			else if (c === '"') quoted = false
			else cell += c
		} else if (c === '"') quoted = true
		else if (c === separator) row.push(cell), (cell = "")
		else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++
			row.push(cell), rows.push(row), (row = []), (cell = "")
		} else cell += c
	}
	if (cell || row.length) row.push(cell), rows.push(row)
	return rows
}

// ── a doc's value, plain: so it can go to the worker (and be typed). its
// immutable strings are strings, its counters numbers
export function plain(value: unknown): unknown {
	if (value === undefined || value === null) return null
	if (typeof value !== "object") return value
	if (value instanceof Uint8Array) return value.slice()
	if (value instanceof Date) return new Date(value)
	if (Array.isArray(value)) return value.map(plain)
	const any = value as Record<string, unknown>
	if (typeof any.val === "string" && Object.keys(any).length === 1) return any.val
	if (typeof any.value === "number" && typeof (any as {increment?: unknown}).increment === "function") return any.value
	return Object.fromEntries(Object.entries(any).map(([key, field]) => [key, plain(field)]))
}

