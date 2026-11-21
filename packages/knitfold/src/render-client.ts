import renderURL from "./render.worker.ts?worker&url"
import type {FromRender, Kind, ToRender} from "./render.worker.ts"

// the page's side of knitfold's drawing: one worker (render.worker.ts) for
// every canvas, each handed over to it, and what's drawn on it said in
// messages

// a module worker, from a script that may be on another origin (a package
// hosted elsewhere): a blob of this origin's can import it (lattice's)
function moduleWorker(url: string) {
	const absolute = new URL(url, import.meta.url)
	if (absolute.origin === location.origin) return new Worker(absolute, {type: "module"})
	const source = `import ${JSON.stringify(absolute.href)};`
	return new Worker(URL.createObjectURL(new Blob([source], {type: "text/javascript"})), {type: "module"})
}

type Message = ToRender extends infer T ? (T extends {id: number} ? Omit<T, "id"> : never) : never

let worker: Worker | null = null
let ids = 0
const listeners = new Map<number, (message: FromRender) => void>()

function theWorker() {
	if (worker) return worker
	worker = moduleWorker(renderURL)
	worker.onmessage = (event: MessageEvent<FromRender>) => listeners.get(event.data.id)?.(event.data)
	return worker
}

export interface Surface {
	send(message: Exclude<Message, {type: "open"}>, transfer?: Transferable[]): void
	close(): void
}

// a canvas, the worker's to draw on from now on
export function openSurface(canvas: HTMLCanvasElement, kind: Kind, onMessage?: (message: FromRender) => void): Surface {
	const id = ++ids
	const offscreen = canvas.transferControlToOffscreen()
	if (onMessage) listeners.set(id, onMessage)
	theWorker().postMessage({type: "open", id, kind, canvas: offscreen} satisfies ToRender, [offscreen])
	return {
		send(message, transfer = []) {
			theWorker().postMessage({...message, id}, transfer)
		},
		close() {
			listeners.delete(id)
			theWorker().postMessage({type: "close", id} satisfies ToRender)
		},
	}
}
