import {isValidAutomergeUrl, type AutomergeUrl} from "@automerge/automerge-repo"
import {createSignal} from "solid-js"
import {findPatiently} from "./find.ts"
import {keyOf, type GetAs, type Given, type Wanted} from "./given.ts"

// the page's side of doc() and get() (given.ts): what a run wanted, got. a
// doc's found (and found again till it is), and kept up with: it changes,
// and the blocks are run again with it. a get's fetched once, and made what
// it's asked to be (or, clever, what it looks like it ought to be)

export function fetcher() {
	const [given, setGiven] = createSignal<Given>({})
	// (what's being got, not got yet: the editor marks them)
	const [loading, setLoading] = createSignal<ReadonlySet<string>>(new Set())
	const started = new Map<string, () => void>()
	let stopped = false

	const settle = (key: string, got: Given[string]) => {
		setGiven(all => ({...all, [key]: got}))
		setLoading(now => {
			if (!now.has(key)) return now
			const next = new Set(now)
			next.delete(key)
			return next
		})
	}

	function want(list: Wanted[]) {
		for (const wanted of list) {
			const key = keyOf(wanted)
			if (started.has(key) || stopped) continue
			started.set(key, () => {})
			setLoading(now => new Set(now).add(key))
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
				return decode(response, as)
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
		/** what a run wanted (and hadn't got) */
		want,
		stop() {
			stopped = true
			for (const off of started.values()) off()
			started.clear()
		},
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

