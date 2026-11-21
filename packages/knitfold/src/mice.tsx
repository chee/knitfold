import {createEffect, createMemo, For, onSettled} from "solid-js"
import {placePointer, type Pointer} from "./anchor.ts"

// the others' mice, over all of knitfold: a tiny ball of yarn each, on
// what they're over (anchor.ts), wherever that is here now. placed again
// every frame while there are any, so it stays on it as you scroll, move
// the scarf or zoom it; and when they move, it glides from where they were
// to where they are (both placed as things are here), so it doesn't jump

const GLIDE = 70
const BALL = 6

export interface Mouse {
	peerId: string
	pointer: Pointer
}

interface Glide {
	from: Pointer | null
	to: Pointer
	json: string
	since: number
}

export default function Mice(props: {
	root: () => HTMLElement | undefined
	mice: Mouse[]
	block: number
	views: Record<string, string>
}) {
	let layer!: HTMLDivElement
	const glides = new Map<string, Glide>()
	let now = {block: props.block, views: props.views}
	let frame = 0

	const ids = createMemo(() => props.mice.map(mouse => mouse.peerId))

	createEffect(
		() => ({mice: props.mice, block: props.block, views: props.views}),
		next => {
			now = {block: next.block, views: next.views}
			const seen = new Set<string>()
			for (const {peerId, pointer} of next.mice) {
				seen.add(peerId)
				const json = JSON.stringify(pointer)
				const had = glides.get(peerId)
				if (had?.json === json) continue
				glides.set(peerId, {from: had?.to ?? null, to: pointer, json, since: performance.now()})
			}
			for (const peerId of glides.keys()) if (!seen.has(peerId)) glides.delete(peerId)
			if (glides.size && !frame) frame = requestAnimationFrame(place)
		},
	)

	function place(time: number) {
		frame = 0
		const root = props.root()
		if (!root || !glides.size) return
		const box = root.getBoundingClientRect()
		for (const el of layer.children as HTMLCollectionOf<SVGElement>) {
			const glide = glides.get(el.dataset.peerId ?? "")
			const to = glide && placePointer(root, glide.to, now.block, now.views)
			if (!glide || !to) {
				el.style.visibility = "hidden"
				continue
			}
			const from = glide.from && placePointer(root, glide.from, now.block, now.views)
			const t = Math.min(1, (time - glide.since) / GLIDE)
			const x = from ? from.x + (to.x - from.x) * t : to.x
			const y = from ? from.y + (to.y - from.y) * t : to.y
			el.style.visibility = "visible"
			el.style.transform = `translate(${x - box.left - BALL / 2}px, ${y - box.top - BALL / 2}px)`
		}
		frame = requestAnimationFrame(place)
	}

	onSettled(() => () => cancelAnimationFrame(frame))

	return (
		<div class="knitfold-mice" ref={layer} aria-hidden="true">
			<For each={ids()}>
				{peerId => (
					<svg class="knitfold-other-mouse" data-peer-id={peerId} viewBox="0 0 18 18" style={{visibility: "hidden"}}>
						<circle class="knitfold-other-ball" cx="9" cy="9" r="8" />
						<path class="knitfold-other-strands" d="M4 5.5c3 1.8 6.5 5 8.5 8.5M7 2.5c3 2 6 5.4 7.6 8.6M2.6 9.5c2.4-2.2 6.6-4.4 11-4.6" />
					</svg>
				)}
			</For>
		</div>
	)
}
