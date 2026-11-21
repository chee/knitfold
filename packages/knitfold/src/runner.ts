import workerURL from "./knitfold.worker.ts?worker&url"
import type {
	GridsRequest,
	GridsResponse,
	KcodeRequest,
	KcodeResponse,
	ValueRequest,
	ValueResponse,
	YarnRequest,
	YarnResponse,
} from "./knitfold.worker.ts"

// a worker that does one thing at a time: asked again while it's busy, it's
// stopped and started afresh (what it was doing isn't wanted now, and it
// can't be told mid-loop). and one that takes longer than `timeout` is
// stopped too: a block's code with a loop that never ends

type Request = Omit<GridsRequest, "id"> | Omit<YarnRequest, "id"> | Omit<KcodeRequest, "id"> | Omit<ValueRequest, "id">
type Response<R> = R extends {type: "grids"}
	? GridsResponse
	: R extends {type: "kcode"}
		? KcodeResponse
		: R extends {type: "value"}
			? ValueResponse
			: YarnResponse

// a module worker, from a script that may be on another origin (a package
// hosted elsewhere): a blob of this origin's can import it (lattice's)
function moduleWorker(url: string) {
	const absolute = new URL(url, import.meta.url)
	if (absolute.origin === location.origin) return new Worker(absolute, {type: "module"})
	const source = `import ${JSON.stringify(absolute.href)};`
	return new Worker(URL.createObjectURL(new Blob([source], {type: "text/javascript"})), {type: "module"})
}

export class Superseded extends Error {}
export class TookTooLong extends Error {}

export function runner(timeout = Infinity) {
	let worker: Worker | null = null
	let id = 0
	let pending: {id: number; reject(error: Error): void; timer: ReturnType<typeof setTimeout> | undefined} | null = null

	function stop() {
		worker?.terminate()
		worker = null
	}

	function run<R extends Request>(request: R, transfer: Transferable[] = []): Promise<Response<R>> {
		if (pending) {
			clearTimeout(pending.timer)
			pending.reject(new Superseded())
			pending = null
			stop()
		}
		worker ??= moduleWorker(workerURL)
		const current = worker
		const mine = ++id
		return new Promise((resolve, reject) => {
			const timer = Number.isFinite(timeout)
				? setTimeout(() => {
						if (pending?.id !== mine) return
						pending = null
						stop()
						reject(new TookTooLong(`stopped after ${timeout / 1000}s: is there a loop that never ends?`))
					}, timeout)
				: undefined
			pending = {id: mine, reject, timer}
			current.onmessage = (event: MessageEvent) => {
				if (event.data.id !== mine) return
				clearTimeout(timer)
				pending = null
				if (event.data.type === "error") reject(new Error(event.data.message))
				else resolve(event.data)
			}
			current.onerror = event => {
				clearTimeout(timer)
				pending = null
				stop()
				reject(new Error(event.message || "the worker stopped"))
			}
			current.postMessage({...request, id: mine}, transfer)
		})
	}

	return {
		run,
		destroy() {
			if (pending) clearTimeout(pending.timer)
			pending = null
			stop()
		},
	}
}
