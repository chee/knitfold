import {RangeSetBuilder, StateEffect} from "@codemirror/state"
import {Decoration, drawSelection, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate} from "@codemirror/view"
import {syntaxTree} from "@codemirror/language"
import type {SyntaxNode} from "@lezer/common"
import {createEffect, onSettled} from "solid-js"
import {DECLARATIONS_PATH} from "./declarations.ts"
import {GET_AS, keyOf, type GetAs, type Wanted} from "./given.ts"

// a block's code: patchwork's own file tool, on the block's .js, as it'd be
// anywhere in patchwork (everyone's carets, comments, the typescript
// language server). knitfold hides its gutter (see knitfold.css), tells its
// language server what a block's names are (declarations.ts: and, as
// doc() and get() get things, what they are), and marks each doc() or get()
// that's still being got, or couldn't be

// the file tool asks whoever's showing it for more codemirror extensions
// with this event (its codemirror-extensions.ts)
const EXTENSIONS_EVENT = "file:codemirror-extensions"

// what it says with it. `languageServer` is there for code files: files of
// knitfold's own for the typescript language server (its tsconfig has all
// of them, so a .d.ts's names are everyone's, no reference needed)
interface ExtensionsDetail {
	extensions: unknown[]
	languageServer?: {writeFile(path: string, text: string): void}
}

// a doc("…") or get("…", "…") call's url, as written: its string, and what
// it asks for (none, if it's not just strings)
function asked(view: EditorView, call: SyntaxNode) {
	const text = (node: SyntaxNode) => view.state.sliceDoc(node.from, node.to)
	const plainString = (node: SyntaxNode | null) => {
		if (node?.name !== "String") return null
		const written = text(node)
		return written.includes("\\") ? null : written.slice(1, -1)
	}
	const callee = call.firstChild
	if (callee?.name !== "VariableName") return null
	const name = text(callee)
	if (name !== "doc" && name !== "get") return null
	const args = callee.nextSibling
	if (args?.name !== "ArgList") return null
	const first = args.firstChild?.nextSibling ?? null
	const url = plainString(first)
	if (url === null || !first) return null
	let wanted: Wanted = {kind: "doc", url}
	if (name === "get") {
		const second = first.nextSibling?.name === "," ? first.nextSibling.nextSibling : null
		const as = second ? plainString(second) : "clever"
		if (!GET_AS.includes(as as GetAs)) return null
		wanted = {kind: "get", url, as: as as GetAs}
	}
	return {key: keyOf(wanted), from: first.from, to: first.to}
}

const loadingMark = Decoration.mark({class: "knitfold-getting", attributes: {title: "getting it…"}})
const refresh = StateEffect.define<null>()

function marks(state: {loading: () => ReadonlySet<string>; failed: () => ReadonlyMap<string, string>}) {
	const build = (view: EditorView): DecorationSet => {
		const loading = state.loading()
		const failed = state.failed()
		const builder = new RangeSetBuilder<Decoration>()
		if (!loading.size && !failed.size) return builder.finish()
		for (const {from, to} of view.visibleRanges) {
			syntaxTree(view.state).iterate({
				from,
				to,
				enter: node => {
					if (node.name !== "CallExpression") return
					const call = asked(view, node.node)
					if (!call) return
					if (loading.has(call.key)) builder.add(call.from, call.to, loadingMark)
					else if (failed.has(call.key)) {
						builder.add(
							call.from,
							call.to,
							Decoration.mark({class: "knitfold-ungot", attributes: {title: failed.get(call.key)!}}),
						)
					}
				},
			})
		}
		return builder.finish()
	}
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet
			constructor(view: EditorView) {
				this.decorations = build(view)
			}
			update(update: ViewUpdate) {
				const asked = update.transactions.some(tr => tr.effects.some(effect => effect.is(refresh)))
				if (asked || update.docChanged || update.viewportChanged) this.decorations = build(update.view)
			}
		},
		{decorations: plugin => plugin.decorations},
	)
}

export default function CodePane(props: {
	url: string
	/** what the language server's told a block can see */
	declarations: () => string
	/** what doc() and get() are still getting, by key (given.ts) */
	loading: () => ReadonlySet<string>
	/** and what they couldn't: why, by key */
	failed: () => ReadonlyMap<string, string>
}) {
	let box!: HTMLDivElement
	const views = new Set<EditorView>()
	const tracked = ViewPlugin.define(view => {
		views.add(view)
		return {destroy: () => views.delete(view)}
	})

	// the block's names, for the language server: written as the file tool
	// asks for extensions, and again as they change. (it holds them till the
	// server's started)
	let server: ExtensionsDetail["languageServer"]
	let told: string | undefined
	const tell = (text: string) => {
		if (!server || text === told) return
		told = text
		server.writeFile(DECLARATIONS_PATH, text)
	}
	createEffect(props.declarations, tell)
	createEffect(
		() => [props.loading(), props.failed()],
		() => {
			for (const view of views) view.dispatch({effects: refresh.of(null)})
		},
	)

	onSettled(() => {
		// (drawSelection: the file tool's editor allows more than one selection,
		// but the browser's own selection only ever shows one of them)
		const extensions = [tracked, marks({loading: props.loading, failed: props.failed}), drawSelection()]
		const extend = (event: Event) => {
			const detail = (event as CustomEvent<ExtensionsDetail>).detail
			detail.extensions.push(...extensions)
			if (detail.languageServer) {
				server = detail.languageServer
				told = undefined
				tell(props.declarations())
			}
		}
		box.addEventListener(EXTENSIONS_EVENT, extend)
		const view = document.createElement("patchwork-view")
		view.setAttribute("doc-url", props.url)
		view.setAttribute("tool-id", "file")
		box.append(view)
		return () => {
			box.removeEventListener(EXTENSIONS_EVENT, extend)
			view.remove()
		}
	})
	return (
		<div class="knitfold-codepane" ref={box} />
	)
}
