import {Text} from "@codemirror/state"
import {ViewPlugin, type EditorView} from "@codemirror/view"
import {onSettled} from "solid-js"
import {DECLARATIONS, DECLARATIONS_URI} from "./declarations.ts"

// a block's code: patchwork's own file tool, on the block's .js, as it'd be
// anywhere in patchwork (everyone's carets, comments, the typescript
// language server). knitfold hides its gutter (see knitfold.css), and tells
// its language server what a block's names are (declarations.ts), so
// hovering one, or completing it, says what it is

// the file tool asks whoever's showing it for more codemirror extensions
// with this event (its codemirror-extensions.ts)
const EXTENSIONS_EVENT = "file:codemirror-extensions"

// the language server's client, once the file tool's started it: the
// editor's lsp plugin, found among its plugins. (the file tool doesn't hand
// it out; this is the one place knitfold reaches in for it)
function lspClientOf(view: EditorView) {
	const plugins = (view as unknown as {plugins?: {value?: {client?: {didOpen?: unknown}}}[]}).plugins ?? []
	return plugins.map(plugin => plugin.value).find(value => typeof value?.client?.didOpen === "function")?.client as
		| {didOpen(file: {uri: string; languageId: string; version: number; doc: Text}): void}
		| undefined
}

const told = new WeakSet<object>()
const declarations = ViewPlugin.define(view => {
	// (the server's loaded on demand, after the editor: look for it a while)
	let tries = 0
	const timer = setInterval(() => {
		const client = lspClientOf(view)
		if (client && !told.has(client)) {
			told.add(client)
			client.didOpen({uri: DECLARATIONS_URI, languageId: "typescript", version: 1, doc: Text.of(DECLARATIONS.split("\n"))})
		}
		if (client || ++tries > 200) clearInterval(timer)
	}, 300)
	return {destroy: () => clearInterval(timer)}
})

export default function CodePane(props: {url: string}) {
	let box!: HTMLDivElement
	onSettled(() => {
		const extend = (event: Event) => (event as CustomEvent<{extensions: unknown[]}>).detail.extensions.push(declarations)
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
