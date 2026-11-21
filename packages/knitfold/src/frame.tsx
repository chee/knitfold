import type {AutomergeUrl, DocHandle, Repo} from "@automerge/automerge-repo"
import {createMemo, Loading, Show} from "solid-js"
import {render} from "@solidjs/web"
import {accept, type SubscribeEvent} from "@inkandswitch/patchwork-providers"
import Knitfold from "./app.tsx"
import type {KnitfoldDoc} from "./datatype.ts"
import {findPatiently} from "./find.ts"

// knitfold's site: the scarf, all the page. everybody's is the same one

// (made 2026-11-21; anyone can change it)
const SCARF = "automerge:nF12zZfSqFKMcWAKnpsx9nrhVdB" as AutomergeUrl

declare global {
	interface Window {
		repo: Repo
	}
}

function Frame(props: {element: HTMLElement; gone: () => boolean}) {
	// (if it can't be found, it's looked for again: "finding the scarf…" till it is)
	const handle = createMemo(() => findPatiently<KnitfoldDoc>(SCARF, {gone: props.gone}))
	return (
		<Loading fallback={<div class="knitfold-loading">finding the scarf…</div>}>
			<Show when={handle()} keyed>
				{h => <Knitfold handle={h} element={props.element} />}
			</Show>
		</Loading>
	)
}

// who you are, for whoever inside asks (patchwork's frame would say, and
// knitfold's is instead of it): the file tool won't show anyone's caret, or
// say where yours is, till it's told
function provideContact(account: DocHandle<{contactUrl?: string}>, element: HTMLElement) {
	const contactUrl = () =>
		new Promise<string>(resolve => {
			const now = account.doc()?.contactUrl
			if (now) return resolve(now)
			const later = () => {
				const url = account.doc()?.contactUrl
				if (url) account.off("change", later), resolve(url)
			}
			account.on("change", later)
		})
	const answer = (event: SubscribeEvent) => {
		if (event.detail.selector.type !== "patchwork:contact") return
		accept<string>(event, respond => {
			let gone = false
			contactUrl().then(url => gone || respond(url))
			return () => (gone = true)
		})
	}
	element.addEventListener("patchwork:subscribe", answer)
	return () => element.removeEventListener("patchwork:subscribe", answer)
}

export default function KnitfoldFrame(account: DocHandle<{contactUrl?: string}>, element: HTMLElement) {
	element.classList.add("knitfold-frame")
	const unprovide = provideContact(account, element)
	let gone = false
	const dispose = render(() => <Frame element={element} gone={() => gone} />, element)
	return () => {
		gone = true
		dispose()
		unprovide()
		element.classList.remove("knitfold-frame")
	}
}
