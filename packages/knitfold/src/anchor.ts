import {EditorView} from "@codemirror/view"

// what's under a mouse in knitfold, said so that someone else can find the
// same thing in theirs: their window's not the size of yours, nor their
// scarf moved or zoomed as yours is, nor their code scrolled as yours, so
// where it is on the page won't do. (lattice's wm does the same for its
// panes, its anchor.js: this is that, for knitfold's parts.) one's:
//   space    a point in a view's own space, for a view that says what's
//            where (its element's inkSpace, below: the stitches views, and
//            lattice's animation and 3d): where that point is now, as it's
//            moved and zoomed
//   text     a character in the block's code: where that character is, as
//            it scrolls
//   element  an element in the part (by child indices from it), and where
//            in it: there, wherever it is now. in what it scrolls, if it does
// each in a part: the toolbar, the scarf (as it's shown: stitches, yarn…),
// the block (as it's shown), its code, the pages' switch. the block and the
// code are of a block, and they're only placed for someone on that block.
// outside all of them, it's a place in the whole of knitfold, a fraction of it
//
// an element can have `inkSpace`: {at(x, y), place(at)}. at takes a point on
// the page (client px) and gives something plain (json) saying what's there,
// or null for nothing; place takes that and gives {x, y, scale} (where it is
// on the page now, and how many page px a unit of its space is), or null

export interface InkSpace {
	at(x: number, y: number): unknown
	place(at: unknown): {x: number; y: number; scale: number} | null
}
type Spaced = Element & {inkSpace?: InkSpace}

export type Anchor =
	| {kind: "space"; path: number[]; at: unknown}
	| {kind: "text"; pos: number}
	| {kind: "element"; path: number[]; tag: string; x: number; y: number}

/** a mouse: in which part (and which of its views, and which block), over what there */
export interface Pointer {
	part: string
	view: string
	block: number | null
	anchor: Anchor | null
	/** with no anchor (outside every part), where in knitfold, as fractions of it */
	x: number
	y: number
	/** how many page px a unit of the anchor's space was, and how far (px) from it */
	scale: number
	dx: number
	dy: number
}

// knitfold's parts, in the order they're looked for
const PARTS = [
	{part: "toolbar", selector: ".knitfold-toolbar", ofBlock: false},
	{part: "scarf", selector: ".knitfold-scarf", ofBlock: false},
	{part: "block", selector: ".knitfold-block", ofBlock: true},
	{part: "code", selector: ".knitfold-code", ofBlock: true},
	{part: "pages", selector: ".knitfold-pages", ofBlock: false},
]

const isObject = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value)
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)
const round = (n: number, by: number) => Math.round(n * by) / by
const MAX_DEPTH = 64
const MAX_CHILDREN = 1000

const inside = (rect: DOMRect, x: number, y: number) =>
	rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

// a part, here: the one that's there, and to be seen
function partEl(root: Element, selector: string) {
	const el = root.querySelector(selector)
	const rect = el?.getBoundingClientRect()
	return el && rect && rect.width && rect.height ? el : null
}

// the deepest of `root`'s elements that (x, y) is in, and the path to it.
// by where they are, not hit testing (the overlay's over everything, and
// a canvas being dragged has the pointer). later ones first, as they're drawn
// over earlier ones
function elementUnder(root: Element, x: number, y: number) {
	const trail: Element[] = [root]
	const path: number[] = []
	let at = root
	for (let depth = 0; depth < MAX_DEPTH; depth++) {
		const children = at.children
		if (children.length > MAX_CHILDREN) break
		let next = -1
		for (let i = children.length - 1; i >= 0; i--) {
			if (inside(children[i].getBoundingClientRect(), x, y)) {
				next = i
				break
			}
		}
		if (next < 0) break
		path.push(next)
		at = children[next]
		trail.push(at)
	}
	return {el: at, path, trail}
}
function elementAt(root: Element, path: number[]) {
	let at: Element | undefined = root
	for (const index of path) at = at?.children[index]
	return at ?? null
}

// where in an element a point is: fractions of it, or of what it scrolls,
// if it does (so it's on the same part of what's in it, scrolled however).
// and back
const scrolls = (el: Element) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
function within(el: Element, x: number, y: number) {
	const rect = el.getBoundingClientRect()
	if (scrolls(el)) {
		return {
			x: (x - rect.left - el.clientLeft + el.scrollLeft) / el.scrollWidth,
			y: (y - rect.top - el.clientTop + el.scrollTop) / el.scrollHeight,
		}
	}
	return {x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height}
}
function placeWithin(el: Element, x: number, y: number) {
	const rect = el.getBoundingClientRect()
	if (!rect.width || !rect.height) return null
	if (scrolls(el)) {
		return {
			x: rect.left + el.clientLeft - el.scrollLeft + x * el.scrollWidth,
			y: rect.top + el.clientTop - el.scrollTop + y * el.scrollHeight,
		}
	}
	return {x: rect.left + x * rect.width, y: rect.top + y * rect.height}
}

function editorIn(el: Element) {
	const editor = el.querySelector(".cm-editor")
	return editor instanceof HTMLElement ? EditorView.findFromDOM(editor) : null
}

/** what's under (x, y) (client px) in knitfold (`root`), on `block`, shown as `views` has its parts */
export function pointerAt(root: Element, x: number, y: number, block: number, views: Record<string, string>): Pointer {
	for (const {part, selector, ofBlock} of PARTS) {
		const el = partEl(root, selector)
		if (!el || !inside(el.getBoundingClientRect(), x, y)) continue
		const base = {part, view: views[part] ?? "", block: ofBlock ? block : null, x: 0, y: 0}
		const {el: under, path, trail} = elementUnder(el, x, y)
		// in a view with a space of its own, the deepest one
		for (let i = trail.length - 1; i >= 0; i--) {
			const space = (trail[i] as Spaced).inkSpace
			if (!space) continue
			try {
				const at = space.at(x, y)
				const placed = at == null ? null : space.place(at)
				if (placed && finite(placed.x) && finite(placed.y) && finite(placed.scale) && placed.scale > 0) {
					const anchor = {kind: "space" as const, path: path.slice(0, i), at}
					return {...base, anchor, scale: placed.scale, dx: round(x - placed.x, 10), dy: round(y - placed.y, 10)}
				}
			} catch (error) {
				console.warn("[knitfold] a view's inkSpace failed", error)
			}
		}
		// in the code, a character
		const editor = part === "code" ? editorIn(el) : null
		if (editor && inside(editor.dom.getBoundingClientRect(), x, y)) {
			const pos = editor.posAtCoords({x, y}, false)
			const at = editor.coordsAtPos(pos)
			if (at) return {...base, anchor: {kind: "text", pos}, scale: 1, dx: round(x - at.left, 10), dy: round(y - at.top, 10)}
		}
		const at = within(under, x, y)
		if (finite(at.x) && finite(at.y)) {
			const anchor = {kind: "element" as const, path, tag: under.localName, x: round(at.x, 10000), y: round(at.y, 10000)}
			return {...base, anchor, scale: 1, dx: 0, dy: 0}
		}
	}
	const box = root.getBoundingClientRect()
	return {
		part: "",
		view: "",
		block: null,
		anchor: null,
		x: round((x - box.left) / box.width, 10000),
		y: round((y - box.top) / box.height, 10000),
		scale: 1,
		dx: 0,
		dy: 0,
	}
}

/**
 * where `pointer` is in knitfold (`root`) here (client px), on `block`, its
 * parts shown as `views` says: or null if what it's over isn't to be seen
 * (another view, another block, scrolled away, out of its part)
 */
export function placePointer(root: Element, pointer: Pointer, block: number, views: Record<string, string>) {
	if (!pointer.anchor) {
		const box = root.getBoundingClientRect()
		return {x: box.left + pointer.x * box.width, y: box.top + pointer.y * box.height}
	}
	const part = PARTS.find(p => p.part === pointer.part)
	if (!part || (views[part.part] ?? "") !== pointer.view) return null
	if (part.ofBlock && pointer.block !== block) return null
	const el = partEl(root, part.selector)
	if (!el) return null
	const placed = placeAnchor(el, pointer.anchor, pointer.scale)
	if (!placed) return null
	const at = {x: placed.x + pointer.dx * placed.k, y: placed.y + pointer.dy * placed.k}
	return inside(el.getBoundingClientRect(), at.x, at.y) ? at : null
}

function placeAnchor(el: Element, anchor: Anchor, scale: number) {
	if (anchor.kind === "space") {
		const space = (elementAt(el, anchor.path) as Spaced | null)?.inkSpace
		if (!space) return null
		try {
			const placed = space.place(anchor.at)
			if (!placed || !finite(placed.x) || !finite(placed.y) || !finite(placed.scale)) return null
			return {x: placed.x, y: placed.y, k: placed.scale / scale}
		} catch {
			return null
		}
	}
	if (anchor.kind === "text") {
		const editor = editorIn(el)
		const at = editor?.coordsAtPos(Math.min(anchor.pos, editor.state.doc.length))
		return at ? {x: at.left, y: at.top, k: 1} : null
	}
	const under = elementAt(el, anchor.path)
	if (!under || under.localName !== anchor.tag) return null
	const at = placeWithin(under, anchor.x, anchor.y)
	return at ? {...at, k: 1} : null
}

function anchorFrom(value: unknown): Anchor | null {
	if (!isObject(value)) return null
	const path = Array.isArray(value.path) && value.path.length <= MAX_DEPTH && value.path.every(n => Number.isInteger(n) && n >= 0)
	if (value.kind === "space" && path && "at" in value) return {kind: "space", path: value.path as number[], at: value.at}
	if (value.kind === "text" && Number.isInteger(value.pos) && (value.pos as number) >= 0) return {kind: "text", pos: value.pos as number}
	if (value.kind === "element" && path && typeof value.tag === "string" && finite(value.x) && finite(value.y)) {
		return {kind: "element", path: value.path as number[], tag: value.tag, x: value.x, y: value.y}
	}
	return null
}

/** a pointer someone sent, checked, or null */
export function pointerFrom(value: unknown): Pointer | null {
	if (!isObject(value)) return null
	const {part, view, block, x, y, scale, dx, dy} = value
	if (typeof part !== "string" || typeof view !== "string") return null
	if (!(block === null || Number.isInteger(block))) return null
	if (![x, y, scale, dx, dy].every(finite) || (scale as number) <= 0) return null
	const anchor = anchorFrom(value.anchor)
	if (part && !anchor) return null
	return {part, view, block: block as number | null, anchor, x: x as number, y: y as number, scale: scale as number, dx: dx as number, dy: dy as number}
}
