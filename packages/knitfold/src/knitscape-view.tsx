import {createEffect, onSettled} from "solid-js"
import type {YarnResponse} from "./knitfold.worker.ts"
import {openSurface, type Surface} from "./render-client.ts"

// the scarf's yarn, as Hannah Twigg-Smith's knitscape draws it: tubes of
// yarn, with their fibres and the shade where they go under each other,
// settled (in the worker) and then still. plated, it's two yarns through
// every loop: the yarn in each loop's face, the plating behind. scroll to
// move up and down it, pinch (or ⌘-scroll) to look closer, drag to turn it,
// right-drag to move it; click a block, or the line beside it, to pick it.
// flip turns the camera round to the back (and the light goes with it).
//
// knitscape's renderer and camera are in the render worker
// (render.worker.ts), on this canvas: the page sends the yarn, and its
// pointer, wheel and clicks; the worker says which block a click was on

const CLICK = 4

export default function KnitscapeView(props: {
	response: YarnResponse | null
	yarn: string
	plating: string | null
	page: string
	flipped: boolean
	busy: boolean
	picked: number
	/** the line beside each block (not for one block alone) */
	lines?: boolean
	onPick: (block: number) => void
}) {
	let box!: HTMLDivElement
	let canvas!: HTMLCanvasElement
	let surface: Surface | null = null

	// the lines' colours: the page's own, quiet and picked
	const lineColours = () => {
		const style = getComputedStyle(box)
		return {
			quiet: style.getPropertyValue("--knitfold-rule").trim() || "#e3d6d8",
			rose: style.getPropertyValue("--knitfold-accent").trim() || "#c8336c",
		}
	}

	function sendYarn() {
		const response = props.response
		if (!response || !surface) return
		surface.send({
			type: "yarn",
			response,
			yarn: props.yarn,
			plating: props.plating,
			page: props.page,
			lines: props.lines !== false,
			picked: props.picked,
			flipped: props.flipped,
			...lineColours(),
		})
	}

	createEffect(
		() => [props.response, props.yarn, props.plating, props.page],
		() => sendYarn(),
	)
	createEffect(
		() => props.picked,
		picked => surface?.send({type: "picked", picked}),
	)
	createEffect(
		() => props.flipped,
		flipped => surface?.send({type: "flip", flipped}),
		{defer: true},
	)

	onSettled(() => {
		surface = openSurface(canvas, "knitscape", message => {
			if (message.type === "picked") props.onPick(message.block)
		})
		const place = (event: MouseEvent) => {
			const rect = canvas.getBoundingClientRect()
			return {x: event.clientX - rect.left, y: event.clientY - rect.top}
		}
		// to the camera: the press, the moves and the letting go (it turns or
		// moves it); and a click that didn't drag picks a block
		let down: {x: number; y: number} | null = null
		const pointer = (event: PointerEvent) => {
			const kind = event.type as "pointerdown" | "pointermove" | "pointerup"
			if (kind === "pointerdown") {
				canvas.setPointerCapture(event.pointerId)
				down = event.button === 0 ? {x: event.clientX, y: event.clientY} : null
			}
			surface?.send({type: "pointer", kind, clientX: event.clientX, clientY: event.clientY, button: event.button, shiftKey: event.shiftKey})
			if (kind === "pointerup" && down && Math.hypot(event.clientX - down.x, event.clientY - down.y) <= CLICK) {
				surface?.send({type: "pick", ...place(event)})
			}
			if (kind === "pointerup") down = null
		}
		const wheel = (event: WheelEvent) => {
			event.preventDefault()
			surface?.send({type: "wheel", ...place(event), deltaX: event.deltaX, deltaY: event.deltaY, ctrlKey: event.ctrlKey, metaKey: event.metaKey})
		}
		const menu = (event: Event) => event.preventDefault()
		canvas.addEventListener("pointerdown", pointer)
		canvas.addEventListener("pointermove", pointer)
		canvas.addEventListener("pointerup", pointer)
		canvas.addEventListener("wheel", wheel, {passive: false})
		canvas.addEventListener("contextmenu", menu)
		const observer = new ResizeObserver(([entry]) => {
			const {width, height} = entry.contentRect
			surface?.send({type: "size", width, height, ratio: devicePixelRatio || 1})
		})
		observer.observe(box)
		sendYarn()
		return () => {
			observer.disconnect()
			canvas.removeEventListener("pointerdown", pointer)
			canvas.removeEventListener("pointermove", pointer)
			canvas.removeEventListener("pointerup", pointer)
			canvas.removeEventListener("wheel", wheel)
			canvas.removeEventListener("contextmenu", menu)
			surface?.close()
			surface = null
		}
	})

	return (
		<div class="knitfold-knitscape" ref={box} data-busy={props.busy ? "" : undefined}>
			<canvas ref={canvas} />
		</div>
	)
}
