import type {DocHandle} from "@automerge/automerge-repo"
import {render} from "@solidjs/web"
import Knitfold from "./app.tsx"
import type {KnitfoldDoc} from "./datatype.ts"

// a knitfold scarf, wherever patchwork opens one
export default function KnitfoldTool(handle: DocHandle<KnitfoldDoc>, element: HTMLElement) {
	return render(() => <Knitfold handle={handle} element={element} />, element)
}
