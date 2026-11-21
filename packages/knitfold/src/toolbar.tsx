import {createSignal, For, onSettled, Show} from "solid-js"
import type {JSX} from "@solidjs/web"
import {BLOCK_SIZES, YARNS} from "./datatype.ts"
import {ICONS, type IconName} from "./icons.ts"

/** the ways the scarf can be shown */
export const VIEWS = [
	{id: "stitches", title: "stitches: a V for each knit, a bump for each purl"},
	{id: "yarn", title: "yarn: knitscape's, settled"},
	{id: "knitting", title: "knitting: lattice's animation, all knitted"},
	{id: "3d", title: "3d: lattice's, all knitted"},
] as const
export type ViewName = (typeof VIEWS)[number]["id"]

// knitfold's toolbar, down the left: what the scarf's made of (the yarn
// and what it's plated with: a cone of each), then its shape (the blocks'
// size, a new block, taking one out), and, at the bottom, what goes out of
// it (its .k, or its kcode). a choice opens beside its button. (turning it
// over to see the back's in the page's top right: it's only yours)

export function Icon(props: {name: IconName; colour?: string}) {
	return (
		<svg
			class="knitfold-icon"
			viewBox="0 0 16 16"
			shape-rendering="crispEdges"
			aria-hidden="true"
			style={props.colour ? {"--c": props.colour} : undefined}
			innerHTML={ICONS[props.name]}
		/>
	)
}

// a little panel beside a button, gone on a click elsewhere or escape
function Pop(props: {open: boolean; onClose: () => void; up?: boolean; children: JSX.Element}) {
	let panel!: HTMLDivElement
	onSettled(() => {
		const away = (event: PointerEvent) => {
			if (props.open && !panel.parentElement?.contains(event.target as Node)) props.onClose()
		}
		const escape = (event: KeyboardEvent) => {
			if (props.open && event.key === "Escape") props.onClose()
		}
		addEventListener("pointerdown", away, true)
		addEventListener("keydown", escape)
		return () => {
			removeEventListener("pointerdown", away, true)
			removeEventListener("keydown", escape)
		}
	})
	return (
		<div class="knitfold-pop" ref={panel} hidden={!props.open} data-up={props.up ? "" : undefined}>
			{props.children}
		</div>
	)
}

export default function Toolbar(props: {
	showing: ViewName
	onShow: (view: ViewName) => void
	/** the views' switch (hidden, for now) */
	switches?: boolean
	yarn: string
	plating: string | null
	size: number
	picked: number
	blocks: number
	canDownload: boolean
	onYarn: (colour: string) => void
	onPlating: (colour: string | null) => void
	/** the scarf's own yarns, after knitfold's */
	yarns: string[]
	/** add a colour to the scarf's own yarns, or take it off */
	onKeep: (colour: string) => void
	onForget: (colour: string) => void
	onSize: (size: number) => void
	onAdd: () => void
	onRemove: () => void
	onDownload: () => void
	onDownloadKcode: () => void
}) {
	type Which = "yarn" | "plating" | "size" | "download"
	const [open, setOpen] = createSignal<Which | null>(null)
	const toggle = (which: Which) => setOpen(now => (now === which ? null : which))
	const close = () => setOpen(null)

	// removing's two clicks: the second within a moment of the first
	const [removing, setRemoving] = createSignal(false)
	let removingTimer: ReturnType<typeof setTimeout> | undefined
	function remove() {
		if (!removing()) {
			setRemoving(true)
			clearTimeout(removingTimer)
			removingTimer = setTimeout(() => setRemoving(false), 2500)
			return
		}
		setRemoving(false)
		props.onRemove()
	}
	onSettled(() => () => clearTimeout(removingTimer))

	// the yarns to choose from: knitfold's, then the scarf's own
	const choices = () => [...YARNS, ...props.yarns.filter(colour => !YARNS.includes(colour))]
	const own = (colour: string | null) => !!colour && props.yarns.includes(colour)
	const custom = (colour: string | null) => !!colour && !YARNS.includes(colour)

	// (made once, and kept: what's picked is read as it changes. made again,
	// its colour input would be too, and the browser's picker would close
	// as soon as a colour was picked in it)
	function palette(picked: () => string | null, choose: (colour: string | null) => void, none: boolean) {
		return (
			<div class="knitfold-palette">
				<For each={choices()}>
					{colour => (
						<button
							class="knitfold-swatch"
							aria-pressed={picked() === colour ? "true" : "false"}
							aria-label={colour}
							title={own(colour) ? `${colour}: this scarf's` : colour}
							onClick={() => (choose(colour), close())}>
							<Icon name="cone" colour={colour} />
						</button>
					)}
				</For>
				<label class="knitfold-more" title="another colour" data-on={custom(picked()) && !own(picked()) ? "" : undefined}>
					<input type="color" value={picked() ?? "#ff48b0"} onInput={event => choose(event.currentTarget.value)} />
				</label>
				<Show when={custom(picked())}>
					<button
						class="knitfold-swatch"
						title={own(picked()) ? "take this colour off the scarf's yarns" : "keep this colour in the scarf's yarns"}
						aria-label={own(picked()) ? "forget this colour" : "keep this colour"}
						onClick={() => {
							const colour = picked()
							if (!colour) return
							if (own(colour)) props.onForget(colour)
							else props.onKeep(colour)
						}}>
						<Icon name={own(picked()) ? "remove" : "add"} />
					</button>
				</Show>
				<Show when={none}>
					<button
						class="knitfold-swatch"
						aria-pressed={picked() == null ? "true" : "false"}
						title="not plated: one yarn"
						aria-label="not plated"
						onClick={() => (choose(null), close())}>
						<Icon name="nocone" />
					</button>
				</Show>
			</div>
		)
	}

	return (
		<nav class="knitfold-toolbar" aria-label="the scarf">
			<div class="knitfold-group" role="radiogroup" aria-label="how the scarf's shown" hidden={props.switches === false}>
				<For each={VIEWS}>
					{view => (
						<button
							class="knitfold-toolbutton"
							role="radio"
							title={view.title}
							aria-label={view.id}
							aria-checked={props.showing === view.id ? "true" : "false"}
							onClick={() => props.onShow(view.id)}>
							<Icon name={view.id} />
						</button>
					)}
				</For>
			</div>

			<div class="knitfold-group">
				<div class="knitfold-holder">
					<button class="knitfold-toolbutton" title="the yarn" aria-label="the yarn" onClick={() => toggle("yarn")}>
						<Icon name="cone" colour={props.yarn} />
					</button>
					<Pop open={open() === "yarn"} onClose={close}>
						{palette(() => props.yarn, colour => colour && props.onYarn(colour), false)}
					</Pop>
				</div>
				<div class="knitfold-holder">
					<button
						class="knitfold-toolbutton"
						title={props.plating ? "plated with" : "plated with: nothing"}
						aria-label="plated with"
						onClick={() => toggle("plating")}>
						<Icon name={props.plating ? "cone" : "nocone"} colour={props.plating ?? undefined} />
					</button>
					<Pop open={open() === "plating"} onClose={close}>
						{palette(() => props.plating, props.onPlating, true)}
					</Pop>
				</div>
			</div>

			<div class="knitfold-group">
				<div class="knitfold-holder">
					<button class="knitfold-toolbutton" title={`blocks are ${props.size} × ${props.size}`} aria-label="block size" onClick={() => toggle("size")}>
						<Icon name="size" />
					</button>
					<Pop open={open() === "size"} onClose={close}>
						<div class="knitfold-sizes">
							<For each={BLOCK_SIZES}>
								{size => (
									<button
										class="knitfold-sizebutton"
										aria-pressed={size === props.size ? "true" : "false"}
										onClick={() => (props.onSize(size), close())}>
										{size}
									</button>
								)}
							</For>
						</div>
					</Pop>
				</div>
				<button class="knitfold-toolbutton" title="new block" aria-label="new block" onClick={() => props.onAdd()}>
					<Icon name="add" />
				</button>
				<button
					class="knitfold-toolbutton"
					data-danger={removing() ? "" : undefined}
					disabled={props.blocks <= 1}
					title={removing() ? "again, to take it out" : "take this block out"}
					aria-label="remove the block"
					onClick={remove}>
					<Icon name="remove" />
				</button>
			</div>

			<span class="knitfold-toolbar-gap" />

			<div class="knitfold-group">
				<div class="knitfold-holder">
					<button
						class="knitfold-toolbutton"
						disabled={!props.canDownload}
						title="download it: knitout, or kcode for the kniterate"
						aria-label="download"
						onClick={() => toggle("download")}>
						<Icon name="download" />
					</button>
					<Pop open={open() === "download"} onClose={close} up>
						<div class="knitfold-downloads">
							<button class="knitfold-sizebutton" title="knitout" onClick={() => (props.onDownload(), close())}>
								.k
							</button>
							<button class="knitfold-sizebutton" title="kcode, for the kniterate" onClick={() => (props.onDownloadKcode(), close())}>
								.kc
							</button>
						</div>
					</Pop>
				</div>
			</div>
		</nav>
	)
}
