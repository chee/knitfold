import type {AutomergeUrl, DocHandle, Repo} from "@automerge/automerge-repo"
import {createMemo, Loading, Show} from "solid-js"
import {render} from "@solidjs/web"
import Knitfold from "./app.tsx"
import type {KnitfoldDoc} from "./datatype.ts"

// knitfold's site: the scarf, all the page. everybody's is the same one

// (made 2026-11-21; anyone can change it)
const SCARF = "automerge:nF12zZfSqFKMcWAKnpsx9nrhVdB" as AutomergeUrl

declare global {
	interface Window {
		repo: Repo
	}
}

function Frame(props: {element: HTMLElement}) {
	const handle = createMemo(() => window.repo.find<KnitfoldDoc>(SCARF))
	return (
		<Loading fallback={<div class="knitfold-loading">finding the scarf…</div>}>
			<Show when={handle()} keyed>
				{h => <Knitfold handle={h} element={props.element} />}
			</Show>
		</Loading>
	)
}

export default function KnitfoldFrame(_account: DocHandle<unknown>, element: HTMLElement) {
	element.classList.add("knitfold-frame")
	const dispose = render(() => <Frame element={element} />, element)
	return () => {
		dispose()
		element.classList.remove("knitfold-frame")
	}
}
