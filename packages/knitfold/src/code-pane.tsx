import {RangeSetBuilder, StateEffect, Text} from "@codemirror/state"
import {Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate} from "@codemirror/view"
import {syntaxTree} from "@codemirror/language"
import type {SyntaxNode} from "@lezer/common"
import {createEffect, onSettled} from "solid-js"
import {DECLARATIONS_URI} from "./declarations.ts"
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

interface LspClient {
	didOpen(file: {uri: string; languageId: string; version: number; doc: Text}): void
	notification(method: string, params: unknown): void
}

// the language server's client, once the file tool's started it: the
// editor's lsp plugin, found among its plugins. (the file tool doesn't hand
// it out; this is the one place knitfold reaches in for it)
function lspClientOf(view: EditorView) {
	const plugins = (view as unknown as {plugins?: {value?: {client?: {didOpen?: unknown}}}[]}).plugins ?? []
	return plugins.map(plugin => plugin.value).find(value => typeof value?.client?.didOpen === "function")?.client as
		| LspClient
		| undefined
}

// each client's declarations, as it was last told them (and which version)
const told = new WeakMap<object, {version: number; text: string}>()
function tell(client: LspClient, text: string) {
	const was = told.get(client)
	if (!was) {
		told.set(client, {version: 1, text})
		client.didOpen({uri: DECLARATIONS_URI, languageId: "typescript", version: 1, doc: Text.of(text.split("\n"))})
		return
	}
	if (was.text === text) return
	const version = was.version + 1
	told.set(client, {version, text})
	client.notification("textDocument/didChange", {textDocument: {uri: DECLARATIONS_URI, version}, contentChanges: [{text}]})
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
	const clients = new Set<LspClient>()

	// (the server's loaded on demand, after the editor: looked for a while)
	const declarations = ViewPlugin.define(view => {
		views.add(view)
		let tries = 0
		const timer = setInterval(() => {
			const client = lspClientOf(view)
			if (client) {
				clients.add(client)
				tell(client, props.declarations())
			}
			if (client || ++tries > 200) clearInterval(timer)
		}, 300)
		return {
			destroy() {
				clearInterval(timer)
				views.delete(view)
			},
		}
	})

	createEffect(props.declarations, text => {
		for (const client of clients) tell(client, text)
	})
	createEffect(
		() => [props.loading(), props.failed()],
		() => {
			for (const view of views) view.dispatch({effects: refresh.of(null)})
		},
	)

	onSettled(() => {
		const extensions = [declarations, marks({loading: props.loading, failed: props.failed})]
		const extend = (event: Event) => (event as CustomEvent<{extensions: unknown[]}>).detail.extensions.push(...extensions)
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
	return <div class="knitfold-codepane" ref={box} />
}
