import {createEffect, createSignal, onSettled, Show} from "solid-js"
import {knitoutHandle, latticeBase, latticePane} from "./lattice.ts"

// one of lattice's panes, on the scarf's .k (lattice's animation, or its 3d
// view), wound to the end: the scarf as it is when it's all knitted. its
// own controls are hidden (knitfold.css): it's a picture of the scarf here.
// clicking a stitch picks its block (the pane says which line of the .k
// it's from, and knitfold knows which block each line's in)

// (a pane rereads its .k this long after it changes: then it's wound on)
const REREAD = 400

export default function LatticeView(props: {
	file: string
	url: string
	knitout: string
	yarn: string
	plating: string | null
	lines: {start: number; end: number}[]
	onPick: (block: number) => void
}) {
	let box!: HTMLDivElement
	const k = knitoutHandle(`${props.url}#scarf.k`)
	const [failed, setFailed] = createSignal("")
	const [ready, setReady] = createSignal(false)

	// to the end: its scrubber, all the way along
	function toTheEnd() {
		const scrubber = box.querySelector<HTMLInputElement>("input[type=range][class$=scrubber]")
		if (!scrubber || scrubber.value === scrubber.max) return
		scrubber.value = scrubber.max
		scrubber.dispatchEvent(new Event("input", {bubbles: true}))
	}

	createEffect(
		() => ({knitout: props.knitout, yarn: props.yarn, plating: props.plating, ready: ready()}),
		({knitout, yarn, plating, ready}) => {
			k.set(knitout, yarn, plating)
			if (!ready) return
			const timer = setTimeout(toTheEnd, REREAD)
			return () => clearTimeout(timer)
		},
	)

	onSettled(() => {
		let stop: (() => void) | undefined
		let gone = false
		const onSource = (event: Event) => {
			const line = (event as CustomEvent<{line?: number}>).detail?.line
			if (line == null) return
			const n = props.lines.findIndex(range => line >= range.start && line <= range.end)
			if (n >= 0) props.onPick(n)
		}
		// (a click on a stitch selects its line; a double-click goes to it)
		box.addEventListener("knitout:select-source", onSource)
		box.addEventListener("knitout:goto-source", onSource)
		latticePane(props.file)
			.then(pane => {
				if (gone) return
				stop = pane(k.handle, box, {events: box})
				setReady(true)
			})
			.catch(error => setFailed(`couldn't load lattice's ${props.file} from ${latticeBase()}: ${error.message}`))
		return () => {
			gone = true
			box.removeEventListener("knitout:select-source", onSource)
			box.removeEventListener("knitout:goto-source", onSource)
			stop?.()
		}
	})

	return (
		<div class="knitfold-lattice" ref={box}>
			<Show when={failed()}>
				<p class="knitfold-lattice-failed">{failed()}</p>
			</Show>
		</div>
	)
}
