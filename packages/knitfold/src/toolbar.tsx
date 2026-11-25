import {createSignal, For, onCleanup, onSettled, Show} from "solid-js"
import type {JSX} from "@solidjs/web"
import {YARNS} from "./datatype.ts"
import {ICONS, type IconName} from "./icons.ts"

/** the ways the scarf can be shown */
export const VIEWS = [
	{id: "stitches", title: "stitches: a V for each knit, a bump for each purl"},
	{id: "yarn", title: "yarn: knitscape's, settled"},
	{id: "knitting", title: "knitting: lattice's animation, all knitted"},
	{id: "3d", title: "3d: lattice's, all knitted"},
] as const
export type ViewName = (typeof VIEWS)[number]["id"]

// knitfold's toolbar, down the left (along the top, on a phone): the
// blocks (a new one, taking the picked one out), then what the scarf's
// made of (the yarn and what it's plated with: a cone of each), and, at the
// end, what goes out of it (its .k, or its kcode). a choice opens beside
// its button. (turning it over to see the back's in the page's top right:
// it's only yours)
//
// two buttons have more, on a right click (or a long press, on a phone):
// the new block's, a new block of either kind (knitfold's own, or
// knitout.js); and the download's, the scarf's settings (its blocks' size,
// its first needle, whether it starts on a waste section, and the
// knitout.js for between each block and the next)

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

/** the scarf's settings (what's in its doc) */
export interface Settings {
	width: number
	height: number
	minNeedle: number
	/** knitout.js, for between each block and the next */
	between: string
	/** what went wrong with it, if anything did */
	betweenError?: string | null
	/** start on Agnes Cameron's waste section */
	waste: boolean
	/** the waste yarn's colour, as it's seen */
	wasteColour: string
}

// a button's more: on a right click, or a finger held on it. (a held
// finger's not a click too, when it comes up)
const HOLD = 450
function more(open: () => void) {
	let timer: ReturnType<typeof setTimeout> | undefined
	let held = false
	let from = {x: 0, y: 0}
	const stop = () => clearTimeout(timer)
	onCleanup(stop)
	return {
		onPointerDown(event: PointerEvent) {
			held = false
			stop()
			if (event.pointerType === "mouse") return
			from = {x: event.clientX, y: event.clientY}
			timer = setTimeout(() => {
				held = true
				open()
			}, HOLD)
		},
		onPointerMove(event: PointerEvent) {
			if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > 8) stop()
		},
		onPointerUp: stop,
		onPointerCancel: stop,
		onContextMenu(event: MouseEvent) {
			event.preventDefault()
			stop()
			held = true
			open()
		},
		/** a click that's a click: not what a held finger left */
		clicked() {
			if (!held) return true
			held = false
			return false
		},
	}
}

// a number, kept to a whole one from min to max
const whole = (value: string, min: number, max: number) => {
	const n = Math.round(Number(value))
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null
}

export default function Toolbar(props: {
	showing: ViewName
	onShow: (view: ViewName) => void
	/** the views' switch (hidden, for now) */
	switches?: boolean
	yarn: string
	plating: string | null
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
	/** a new block: knitfold's own (stitches), or knitout.js */
	onAdd: (kind: "stitches" | "knitout") => void
	onRemove: () => void
	onDownload: () => void
	onDownloadKcode: () => void
	settings: Settings
	onSetting: (name: "width" | "height" | "minNeedle", value: number) => void
	onBetween: (knitout: string) => void
	onWaste: (waste: boolean) => void
	onWasteColour: (colour: string) => void
}) {
	type Which = "yarn" | "plating" | "download" | "remove" | "add" | "settings"
	const [open, setOpen] = createSignal<Which | null>(null)
	const adding = more(() => setOpen("add"))
	const setting = more(() => setOpen("settings"))
	const toggle = (which: Which) => setOpen(now => (now === which ? null : which))
	const close = () => setOpen(null)

	// the yarns to choose from: knitfold's, then the scarf's own
	const choices = () => [...YARNS, ...props.yarns.filter(colour => !YARNS.includes(colour))]
	const own = (colour: string | null) => !!colour && props.yarns.includes(colour)
	const custom = (colour: string | null) => !!colour && !YARNS.includes(colour)

	// (made once, and kept: what's picked is read as it changes. made again,
	// its colour input would be too, and the browser's picker would close
	// as soon as a colour was picked in it)
	// (stay: a choice doesn't close what it's in)
	function palette(picked: () => string | null, choose: (colour: string | null) => void, none: boolean, stay = false) {
		const done = () => stay || close()
		return (
			<div class="knitfold-palette">
				<For each={choices()}>
					{colour => (
						<button
							class="knitfold-swatch"
							aria-pressed={picked() === colour ? "true" : "false"}
							aria-label={colour}
							title={own(colour) ? `${colour}: this scarf's` : colour}
							onClick={() => (choose(colour), done())}>
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
						onClick={() => (choose(null), done())}>
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
					<button
						class="knitfold-toolbutton knitfold-more-button"
						aria-pressed={open() === "add" ? "true" : "false"}
						title="new block (right click, or hold: a knitout.js block)"
						aria-label="new block"
						aria-haspopup="menu"
						onPointerDown={adding.onPointerDown}
						onPointerMove={adding.onPointerMove}
						onPointerUp={adding.onPointerUp}
						onPointerCancel={adding.onPointerCancel}
						onContextMenu={adding.onContextMenu}
						onClick={() => adding.clicked() && props.onAdd("stitches")}>
						<Icon name="add" />
					</button>
					<Pop open={open() === "add"} onClose={close}>
						<div class="knitfold-menu" role="menu" aria-label="a new block">
							<button class="knitfold-sizebutton" role="menuitem" title="a stitch for each x and y" onClick={() => (props.onAdd("stitches"), close())}>
								knitfold block
							</button>
							<button
								class="knitfold-sizebutton"
								role="menuitem"
								title="a knitout.js pattern, as lattice's: k, min_needle, max_needle and main_carrier are given"
								onClick={() => (props.onAdd("knitout"), close())}>
								knitout.js block
							</button>
						</div>
					</Pop>
				</div>
				<div class="knitfold-holder">
					<button
						class="knitfold-toolbutton"
						aria-pressed={open() === "remove" ? "true" : "false"}
						disabled={props.blocks <= 1}
						title="take this block out"
						aria-label="remove the block"
						onClick={() => toggle("remove")}>
						<Icon name="remove" />
					</button>
					<Pop open={open() === "remove"} onClose={close}>
						<button class="knitfold-sizebutton knitfold-delete" onClick={() => (props.onRemove(), close())}>
							Delete?
						</button>
					</Pop>
				</div>
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

			<span class="knitfold-toolbar-gap" />

			<div class="knitfold-group">
				<div class="knitfold-holder">
					<button
						class="knitfold-toolbutton knitfold-more-button"
						aria-pressed={open() === "settings" ? "true" : "false"}
						data-off={props.canDownload ? undefined : ""}
						title="download it: knitout, or kcode for the kniterate (right click, or hold: the scarf's settings)"
						aria-label="download"
						onPointerDown={setting.onPointerDown}
						onPointerMove={setting.onPointerMove}
						onPointerUp={setting.onPointerUp}
						onPointerCancel={setting.onPointerCancel}
						onContextMenu={setting.onContextMenu}
						onClick={() => setting.clicked() && props.canDownload && toggle("download")}>
						<Icon name="download" />
					</button>
					<Pop open={open() === "settings"} onClose={close} up>
						<form class="knitfold-settings" aria-label="the scarf's settings" onSubmit={event => event.preventDefault()}>
							<label>
								<span>block width</span>
								<input
									type="number"
									min="1"
									max="252"
									value={props.settings.width}
									onChange={event => {
										const n = whole(event.currentTarget.value, 1, 252)
										if (n == null) event.currentTarget.value = String(props.settings.width)
										else props.onSetting("width", n)
									}}
								/>
							</label>
							<label>
								<span>block height</span>
								<input
									type="number"
									min="1"
									max="1024"
									value={props.settings.height}
									onChange={event => {
										const n = whole(event.currentTarget.value, 1, 1024)
										if (n == null) event.currentTarget.value = String(props.settings.height)
										else props.onSetting("height", n)
									}}
								/>
							</label>
							<label>
								<span>first needle</span>
								<input
									type="number"
									min="0"
									max="252"
									title="the needle the scarf's first column is on (min_needle)"
									value={props.settings.minNeedle}
									onChange={event => {
										const n = whole(event.currentTarget.value, 0, 252)
										if (n == null) event.currentTarget.value = String(props.settings.minNeedle)
										else props.onSetting("minNeedle", n)
									}}
								/>
							</label>
							<label class="knitfold-waste" title="Agnes Cameron's: waste yarn on carrier 6, a draw thread on carrier 1, then the cast on">
								<input type="checkbox" checked={props.settings.waste} onChange={event => props.onWaste(event.currentTarget.checked)} />
								<span>start on a waste section</span>
							</label>
							<Show when={props.settings.waste}>
								<div class="knitfold-waste-colour">
									<span>waste yarn</span>
									{palette(() => props.settings.wasteColour, colour => colour && props.onWasteColour(colour), false, true)}
								</div>
							</Show>
							<label class="knitfold-between">
								<span>between blocks (knitout.js)</span>
								<textarea
									rows="8"
									spellcheck={false}
									autocomplete="off"
									placeholder={
										"// knitout.js, between each block and the next.\n" +
										"// k, min_needle, max_needle, carrier and home()\n" +
										"// are predefined, as in a knitout.js block\n" +
										"home()\n" +
										"for (let n = min_needle; n <= max_needle; ++n)\n" +
										"\tk.knit(\"+\", \"f\" + n, carrier)"
									}
									value={props.settings.between}
									onInput={event => props.onBetween(event.currentTarget.value)}
								/>
								<Show when={props.settings.betweenError}>
									<span class="knitfold-between-error" role="status">
										{props.settings.betweenError}
									</span>
								</Show>
							</label>
						</form>
					</Pop>
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
