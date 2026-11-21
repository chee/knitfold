// lattice's own panes, from where lattice is: its animation and its 3d
// view are lattice's code, as lattice has it, imported from its site (it
// sends its packages to anyone who asks). `localStorage["knitfold:lattice"]`
// points it at another lattice: a dev server's, say
// (http://localhost:5173/packages/lattice/)

const LATTICE = "https://lattice.patchwork.inkandswitch.com/packages/lattice/"

export function latticeBase() {
	try {
		return localStorage.getItem("knitfold:lattice") || LATTICE
	} catch {
		return LATTICE
	}
}

export type LatticePane = (handle: KnitoutHandle, element: HTMLElement, context?: {events?: EventTarget}) => () => void

export async function latticePane(file: string): Promise<LatticePane> {
	const module = await import(/* @vite-ignore */ new URL(file, latticeBase()).href)
	return module.default
}

// what a lattice pane wants of a .k: its text, its yarns, and to hear when
// they change. this one's the scarf's, made by knitfold as it changes,
// rather than a file of its own
export interface KnitoutDoc {
	content: string
	extension: "k"
	yarns: {colours: string[]; plated: boolean}[]
}

export interface KnitoutHandle {
	url: string
	doc(): KnitoutDoc
	on(event: "change", listener: () => void): void
	off(event: "change", listener: () => void): void
	change(fn: (doc: KnitoutDoc) => void): void
}

export function knitoutHandle(url: string) {
	let doc: KnitoutDoc = {content: "", extension: "k", yarns: []}
	const listeners = new Set<() => void>()
	const handle: KnitoutHandle = {
		url,
		doc: () => doc,
		on: (_, listener) => void listeners.add(listener),
		off: (_, listener) => void listeners.delete(listener),
		// (its yarns are knitfold's: a pane can't change them)
		change() {},
	}
	return {
		handle,
		set(content: string, yarn: string, plating: string | null) {
			const colours = plating ? [yarn, plating] : [yarn]
			if (content === doc.content && colours.join() === doc.yarns[0]?.colours.join()) return
			doc = {content, extension: "k", yarns: [{colours, plated: !!plating}]}
			for (const listener of listeners) listener()
		},
	}
}
