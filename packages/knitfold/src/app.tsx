import type {AutomergeUrl, DocHandle, Repo} from "@automerge/automerge-repo"
import {createEffect, createMemo, createSignal, For, onSettled, Show} from "solid-js"
import type {ChartColours} from "./chart.ts"
import ChartView from "./chart-view.tsx"
import CodePane from "./code-pane.tsx"
import {codeFile, newBlock, YARNS, type CodeFile, type KnitfoldDoc} from "./datatype.ts"
import type {GridsResponse, YarnResponse} from "./knitfold.worker.ts"

import KnitscapeView from "./knitscape-view.tsx"
import LatticeView from "./lattice-view.tsx"
import {runner, Superseded} from "./runner.ts"
import ScarfView, {type StitchScene} from "./scarf-view.tsx"
import Toolbar, {Icon, VIEWS, type ViewName} from "./toolbar.tsx"
import {knitoutOf} from "./knitout.ts"
import {creamOf, scarfPresence} from "./presence.ts"
import "./knitfold.css"
import {addFonts} from "./fonts.ts"

// a scarf: down the left, the toolbar; beside it, the whole scarf in yarn,
// the first block knitted at the bottom; on the right, the picked block as a
// chart, and its code under it

const NEW_BLOCK = `// a new block by you
// everyone shares a scarf, btw
// you have sin, cos, PI, etc avail
// y is row, x is col
// code is an expression
// expression's result is a numbered stitch or technique
// over an area, techniques provide a texture
// 0-6, each with a shorthand global variable
// 0 - back bed (b)
// 1 - front bed (f)
// 2 - garter (g)
// 3 - seed/moss (s)
// 4 - 1x1 rib (r) (r1)
// 5 - 2x2 rib (r2)
// 6 - 1x2 rib (r3)
(x + y) % 8 < 4 ? r1 : s`

declare global {
	interface Window {
		repo: Repo
	}
}

function hashOf(blocks: Uint8Array[]) {
	let hash = 0x811c9dc5
	for (const bytes of blocks) {
		for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 0x01000193)
		hash = Math.imul(hash ^ 0xff, 0x01000193)
	}
	return hash >>> 0
}

function saveFile(text: string, name: string) {
	const url = URL.createObjectURL(new Blob([text], {type: "text/plain"}))
	const link = document.createElement("a")
	link.href = url
	link.download = name
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function keep(key: string, value: string) {
	try {
		localStorage.setItem(key, value)
	} catch {}
}

const text = (content: unknown) => (typeof content === "string" ? content : content == null ? "" : String(content))

// the theme's colours, as they are now (and again when the theme changes)
function themeColours(element: HTMLElement) {
	const read = () => {
		const style = getComputedStyle(element)
		const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
		return {
			page: get("--knitfold-page", "#fcf7f2"),
			ink: get("--knitfold-ink", "#2c2231"),
			grid: get("--knitfold-grid", "#2c223133"),
			wash: get("--knitfold-hover", "#fff6a8"),
		}
	}
	const [colours, setColours] = createSignal(read())
	onSettled(() => {
		const again = () => requestAnimationFrame(() => setColours(read()))
		const observer = new MutationObserver(again)
		observer.observe(document.documentElement, {attributes: true, attributeFilter: ["theme", "class", "style", "data-theme"]})
		const media = matchMedia("(prefers-color-scheme: dark)")
		media.addEventListener("change", again)
		// (the stylesheet may land after the first read)
		again()
		return () => {
			observer.disconnect()
			media.removeEventListener("change", again)
		}
	})
	return colours
}

export default function Knitfold(props: {handle: DocHandle<KnitfoldDoc>; element: HTMLElement}) {
	addFonts()
	// (a scarf's view is for one scarf: another is another view)
	const handle = props.handle
	const [doc, setDoc] = createSignal(handle.doc(), {equals: false})
	const colours = themeColours(props.element)
	const change = (fn: (d: KnitfoldDoc) => void) => handle.change(fn)

	// ── which block (yours alone: it's not in the doc)

	const pickedKey = `knitfold:${handle.url}:block`
	const [picked, setPicked] = createSignal(
		(() => {
			try {
				return Number(localStorage.getItem(pickedKey)) || 0
			} catch {
				return 0
			}
		})(),
	)
	const blocks = createMemo(() => doc()?.blocks ?? [])
	const block = createMemo(() => Math.max(0, Math.min(picked(), blocks().length - 1)))
	function pick(n: number) {
		setPicked(n)
		keep(pickedKey, String(n))
		// (on a phone, a page at a time: picking a block's to see it)
		if (narrow()) setPage("block")
	}
	// on a phone: the scarf, or the picked block (its chart and code)
	const [page, setPage] = createSignal<"scarf" | "block">("scarf")
	const narrowQuery = matchMedia("(max-width: 760px)")
	const [narrow, setNarrow] = createSignal(narrowQuery.matches)
	const onNarrow = () => setNarrow(narrowQuery.matches)
	narrowQuery.addEventListener("change", onNarrow)
	const width = createMemo(() => doc()?.width || 64)
	const height = createMemo(() => doc()?.height || 64)

	// ── each block's code: its file's text, kept up with

	const [codes, setCodes] = createSignal<Record<string, string>>({})
	const files = new Map<string, {handle?: DocHandle<CodeFile>; off: () => void}>()
	createEffect(
		() => blocks().map(b => b.file).filter(Boolean) as AutomergeUrl[],
		urls => {
			for (const [url, file] of files) {
				if (urls.includes(url as AutomergeUrl)) continue
				file.off()
				files.delete(url)
			}
			for (const url of urls) {
				if (files.has(url)) continue
				const entry: {handle?: DocHandle<CodeFile>; off: () => void} = {off: () => {}}
				files.set(url, entry)
				window.repo.find<CodeFile>(url).then(file => {
					if (files.get(url) !== entry) return
					const read = () => setCodes(all => ({...all, [url]: text(file.doc()?.content)}))
					file.on("change", read)
					entry.handle = file
					entry.off = () => file.off("change", read)
					read()
				})
			}
		},
	)

	// ── the stitches: every block's code run, off the page's thread

	const grids = runner(4000)
	const yarns = runner()

	const [result, setResult] = createSignal<GridsResponse | null>(null)
	const [problem, setProblem] = createSignal<string | null>(null)
	let gridsKey = ""
	let gridsTimer: ReturnType<typeof setTimeout> | undefined
	createEffect(
		() => {
			const d = doc()
			if (!d?.blocks) return null
			const all = codes()
			const blockCodes = d.blocks.map(b => (b.file ? all[b.file] : text(b.code)))
			// (what it's made of, pinned, for the .k to say: the scarf, then each
			// block's code, as each is now)
			const pin = (h: DocHandle<unknown> | undefined) => (h ? h.view(h.heads()).url : null)
			const sources = [pin(handle), ...d.blocks.map(b => pin(b.file ? files.get(b.file)?.handle : undefined))].filter(
				(url): url is AutomergeUrl => !!url,
			)
			// (not until every block's code is here)
			if (blockCodes.some(code => code === undefined)) return null
			return {
				type: "grids" as const,
				codes: blockCodes as string[],
				width: d.width || 64,
				height: d.height || 64,
				title: d.title || "scarf",
				colour: d.yarn || YARNS[0],
				plating: d.plating ?? null,
				// (what's knitted is t at 0: the chart moves, below)
				time: 0,
				sources,
			}
		},
		request => {
			if (!request) return
			const key = JSON.stringify(request)
			if (key === gridsKey) return
			const first = !gridsKey
			gridsKey = key
			clearTimeout(gridsTimer)
			gridsTimer = setTimeout(
				() =>
					grids
						.run(request)
						.then(response => {
							setResult(response)
							setProblem(null)
						})
						.catch(error => {
							if (!(error instanceof Superseded)) setProblem(error.message)
						}),
				first ? 0 : 120,
			)
		},
	)

	const blockResult = () => result()?.blocks[block()]

	// ── how the scarf's shown: as stitches, its yarn, lattice's knitting or
	//    its 3d; and flipped or not (yours alone: the view's kept)

	// (for now: the stitches, always. the others are here, their switch hidden)
	const [showing, setShowing] = createSignal<ViewName>("stitches")
	function show(view: ViewName) {
		setShowing(view)
		keep("knitfold:view", view)
	}
	const [flipped, setFlipped] = createSignal(false)

	// the stitches: each block's, a V or a bump each (drawn in the render worker)
	const scene = createMemo<StitchScene | null>(() => {
		const r = result()
		if (!r) return null
		return {
			blocks: r.blocks.map(b => b.stitches),
			width: width(),
			height: height(),
			colours: {yarn: doc()?.yarn || YARNS[0], plating: doc()?.plating ?? null, page: colours().page, wash: colours().wash},
		}
	})

	// ── the yarn: the whole scarf, laid out at once, then settled (only when
	//    it's shown: settling's seconds of work)

	const [settled, setSettled] = createSignal<YarnResponse | null>(null)
	const [settling, setSettling] = createSignal(false)
	let yarnKey = ""
	let yarnTimer: ReturnType<typeof setTimeout> | undefined
	createEffect(
		() => ({r: result(), w: width(), h: height(), plated: !!doc()?.plating, wanted: showing() === "yarn"}),
		({r, w, h, plated, wanted}) => {
			if (!r || !wanted) return
			const stitches = r.blocks.map(b => b.stitches)
			const key = `${w}×${h}:${plated}:${hashOf(stitches)}`
			if (key === yarnKey) return
			const first = !yarnKey
			yarnKey = key
			clearTimeout(yarnTimer)
			setSettling(true)
			const ask = (relax: boolean) => {
				const copies = stitches.map(s => s.slice())
				return yarns.run({type: "yarn", blocks: copies, relax, plated, width: w, height: h}, copies.map(c => c.buffer)) as Promise<YarnResponse>
			}
			yarnTimer = setTimeout(
				() =>
					// as it's laid out (a moment), and then settled (seconds)
					ask(false)
						.then(laid => {
							setSettled(laid)
							return ask(true)
						})
						.then(done => {
							setSettled(done)
							setSettling(false)
						})
						.catch(error => {
							if (error instanceof Superseded) return
							setSettling(false)
							console.warn("knitfold: the yarn didn't settle", error)
						}),
				first ? 0 : 250,
			)
		},
	)

	// ── t: the picked block, again and again as time goes, when its code
	//    has a t in it (its chart moves; the scarf and its .k are t at 0)

	const live = runner(1000)
	const [moving, setMoving] = createSignal<Uint8Array | null>(null)
	const started = performance.now()
	createEffect(
		() => {
			const d = doc()
			const file = blocks()[block()]?.file
			const code = file ? codes()[file] : text(blocks()[block()]?.code)
			const timed = !!code && /\bt\b/.test(code.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ""))
			return timed && d ? {code: code!, w: d.width || 64, h: d.height || 64} : null
		},
		timed => {
			setMoving(null)
			if (!timed) return
			let going = true
			const tick = () => {
				if (!going) return
				live
					.run({
						type: "grids",
						codes: [timed.code],
						width: timed.w,
						height: timed.h,
						title: "",
						colour: "",
						plating: null,
						time: (performance.now() - started) / 1000,
					})
					.then(response => {
						if (!going) return
						setMoving(response.blocks[0].stitches)
						requestAnimationFrame(tick)
					})
					.catch(() => going && setTimeout(tick, 500))
			}
			tick()
			return () => {
				going = false
			}
		},
	)

	// ── the picked block, alone: as a chart (as big as fits), or as any of
	//    the scarf's views (yours alone: which is kept)

	const BLOCK_VIEWS = [{id: "chart", title: "chart: a square a stitch, the colour that shows"}, ...VIEWS] as const
	type BlockView = (typeof BLOCK_VIEWS)[number]["id"]
	// (for now: the chart, always. the others are here, their switch hidden)
	const [blockView, setBlockView] = createSignal<BlockView>("chart")
	const SWITCHES = false
	function showBlock(view: BlockView) {
		setBlockView(view)
		keep("knitfold:block-view", view)
	}
	// its stitches (moving with t, if its code has one)
	const blockStitches = () => moving() ?? blockResult()?.stitches
	const blockScene = createMemo<StitchScene | null>(() => {
		const stitches = blockStitches()
		if (!stitches || stitches.length !== width() * height()) return null
		return {
			blocks: [stitches],
			width: width(),
			height: height(),
			colours: {yarn: doc()?.yarn || YARNS[0], plating: doc()?.plating ?? null, page: colours().page, wash: colours().page},
		}
	})
	// its own .k: cast on, it, and off
	const blockKnitout = createMemo(() => {
		const stitches = blockResult()?.stitches
		if (!stitches) return ""
		const grid = {width: width(), height: height(), stitches, techniques: new Uint8Array(0)}
		return knitoutOf([grid], {title: `block ${block() + 1}`, colour: doc()?.yarn || YARNS[0], plating: doc()?.plating ?? null})
	})
	// its yarn, settled (when that's what's shown)
	const blockYarns = runner()
	const [blockSettled, setBlockSettled] = createSignal<YarnResponse | null>(null)
	const [blockSettling, setBlockSettling] = createSignal(false)
	let blockYarnKey = ""
	createEffect(
		() => ({stitches: blockResult()?.stitches, w: width(), h: height(), plated: !!doc()?.plating, wanted: blockView() === "yarn"}),
		({stitches, w, h, plated, wanted}) => {
			if (!stitches || !wanted) return
			const key = `${w}×${h}:${plated}:${hashOf([stitches])}`
			if (key === blockYarnKey) return
			blockYarnKey = key
			setBlockSettling(true)
			const ask = (relax: boolean) => {
				const copy = stitches.slice()
				return blockYarns.run({type: "yarn", blocks: [copy], relax, plated, width: w, height: h}, [copy.buffer]) as Promise<YarnResponse>
			}
			ask(false)
				.then(laid => {
					setBlockSettled(laid)
					return ask(true)
				})
				.then(done => {
					setBlockSettled(done)
					setBlockSettling(false)
				})
				.catch(error => {
					if (error instanceof Superseded) return
					setBlockSettling(false)
					console.warn("knitfold: the block's yarn didn't settle", error)
				})
		},
	)

	// the side: the chart as wide as it can be, but for its corners (the
	// turning-over button's in one), and no more than three fifths of it
	// high: the code has the rest
	let sideBox!: HTMLElement
	const [room, setRoom] = createSignal({width: 0, height: 0})
	const cell = createMemo(() => {
		const {width: w, height: h} = room()
		return Math.max(2, Math.min(16, Math.floor(Math.min((w - 72) / width(), ((h - 16) * 0.6) / height()))))
	})
	const chartColours = createMemo<ChartColours>(() => {
		const yarn = doc()?.yarn || YARNS[0]
		return {page: colours().page, ink: colours().ink, grid: colours().grid, face: yarn, back: doc()?.plating || yarn}
	})

	// ── changing the scarf

	function addBlock() {
		const at = blocks().length
		const made = newBlock(window.repo, at, NEW_BLOCK)
		change(d => {
			d.blocks.push(made)
		})
		pick(at)
	}
	function removeBlock() {
		const n = block()
		if (blocks().length <= 1) return
		change(d => {
			d.blocks.splice(n, 1)
		})
		pick(Math.max(0, n - 1))
	}



	// ── who else is here: a dot by the block each's looking at, or, in its
	// code, a needle where they are (the file tool's caret, made one)

	const here = scarfPresence(handle, {block: block(), typing: false})
	createEffect(block, n => here.say("block", n))
	const dots = createMemo(() => here.others().filter(other => !other.typing))
	// (each one's cream, wherever they're seen: their dot here, their caret in
	// the code, which the file tool marks with the same peer id)
	const creams = createMemo(() =>
		here
			.others()
			.map(other => `.knitfold [data-peer-id="${CSS.escape(other.peerId)}"] { --knitfold-them: ${creamOf(other.peerId)}; }`)
			.join("\n"),
	)
	let codeBox!: HTMLDivElement

	onSettled(() => {
		const onChange = () => setDoc(handle.doc())
		handle.on("change", onChange)
		// (in the block's code: typing, as far as the others are told)
		const typing = () => here.say("typing", codeBox.contains(document.activeElement))
		const away = (event: FocusEvent) => {
			if (!codeBox.contains(event.relatedTarget as Node | null)) here.say("typing", false)
		}
		codeBox.addEventListener("focusin", typing)
		codeBox.addEventListener("focusout", away)
		// a scarf from before blocks were files: each block's code, a file
		const old = handle.doc()?.blocks ?? []
		if (old.some(b => !b.file)) {
			const made = old.map((b, n) => (b.file ? null : window.repo.create<CodeFile>(codeFile(`block ${n + 1}.js`, text(b.code))).url))
			change(d => {
				d.blocks.forEach((b, n) => {
					const url = made[n]
					if (!url || b.file) return
					b.file = url
					delete b.code
				})
			})
		}
		const observer = new ResizeObserver(([entry]) =>
			setRoom({width: entry.contentRect.width, height: entry.contentRect.height}),
		)
		observer.observe(sideBox)
		return () => {
			narrowQuery.removeEventListener("change", onNarrow)
			handle.off("change", onChange)
			codeBox.removeEventListener("focusin", typing)
			codeBox.removeEventListener("focusout", away)
			here.stop()
			observer.disconnect()
			for (const file of files.values()) file.off()
			grids.destroy()
			yarns.destroy()
			kcodes.destroy()
			blockYarns.destroy()
			live.destroy()
			clearTimeout(gridsTimer)
			clearTimeout(yarnTimer)
		}
	})

	const fileName = () => (doc()?.title || "scarf").replace(/[^\w.-]+/g, "-")
	function download() {
		const knitout = result()?.knitout
		if (!knitout) return
		saveFile(knitout, `${fileName()}.k`)
	}
	// the kniterate's own: the .k, converted (in the worker), its first line
	// the docs it was made from
	const kcodes = runner()
	async function downloadKcode() {
		const knitout = result()?.knitout
		if (!knitout) return
		const sources = (knitout.match(/^x-patchwork-sources (.*)$/m)?.[1] ?? "").split(/\s+/).filter(Boolean)
		try {
			const {kcode} = await kcodes.run({type: "kcode", knitout, name: `${fileName()}.k`, sources})
			saveFile(kcode, `${fileName()}.kc`)
		} catch (error) {
			if (!(error instanceof Superseded)) setProblem(`couldn't make kcode: ${error instanceof Error ? error.message : error}`)
		}
	}


	const problemText = () => {
		const p = problem() ?? blockResult()?.error
		return p ? (typeof p === "string" ? p : p.message) : ""
	}
	const pickedFile = () => blocks()[block()]?.file ?? null

	return (
		<div class="knitfold" data-page={page()}>
			<style>{creams()}</style>
			<Toolbar
				showing={showing()}
				onShow={show}
				switches={false}
				yarn={doc()?.yarn || YARNS[0]}
				plating={doc()?.plating ?? null}
				picked={block()}
				blocks={blocks().length}
				canDownload={!!result()}
				onYarn={colour => change(d => (d.yarn = colour))}
				onPlating={colour => change(d => (d.plating = colour))}
				yarns={doc()?.yarns ?? []}
				onKeep={colour =>
					change(d => {
						d.yarns ??= []
						if (!d.yarns.includes(colour)) d.yarns.push(colour)
					})
				}
				onForget={colour =>
					change(d => {
						const at = d.yarns?.indexOf(colour) ?? -1
						if (at >= 0) d.yarns!.splice(at, 1)
					})
				}
				onAdd={addBlock}
				onRemove={removeBlock}
				onDownload={download}
				onDownloadKcode={downloadKcode}
			/>

			<main class="knitfold-scarf">
				<Show when={showing() === "stitches"}>
					<ScarfView
						scene={scene()}
						picked={block()}
						turn={0}
						flipped={flipped()}
						others={dots()}
						onPick={pick}
					/>
				</Show>
				<Show when={showing() === "yarn"}>
					<KnitscapeView
						response={settled()}
						yarn={doc()?.yarn || YARNS[0]}
						plating={doc()?.plating ?? null}
						page={colours().page}
						flipped={flipped()}
						busy={settling()}
						picked={block()}
						onPick={pick}
					/>
				</Show>
				<Show when={showing() === "knitting"}>
					<LatticeView
						file="animation.js"
						url={handle.url}
						knitout={result()?.knitout ?? ""}
						yarn={doc()?.yarn || YARNS[0]}
						plating={doc()?.plating ?? null}
						lines={result()?.lines ?? []}
						onPick={pick}
					/>
				</Show>
				<Show when={showing() === "3d"}>
					<LatticeView
						file="knit3d.js"
						url={handle.url}
						knitout={result()?.knitout ?? ""}
						yarn={doc()?.yarn || YARNS[0]}
						plating={doc()?.plating ?? null}
						lines={result()?.lines ?? []}
						onPick={pick}
					/>
				</Show>
			</main>

			<aside class="knitfold-side" ref={sideBox}>
				<div class="knitfold-block" data-chart={blockView() === "chart" ? "" : undefined}>
					<div class="knitfold-blockviews" role="radiogroup" aria-label="how the block's shown" hidden={!SWITCHES}>
						<For each={BLOCK_VIEWS}>
							{view => (
								<button
									class="knitfold-toolbutton"
									role="radio"
									title={view.title}
									aria-label={`block: ${view.id}`}
									aria-checked={blockView() === view.id ? "true" : "false"}
									onClick={() => showBlock(view.id)}>
									<Icon name={view.id} />
								</button>
							)}
						</For>
					</div>
					<Show when={blockView() === "chart"}>
						<div class="knitfold-dots">
							<ChartView
								stitches={blockStitches()}
								width={width()}
								height={height()}
								cell={cell()}
								colours={chartColours()}
								flipped={flipped()}
							/>
						</div>
					</Show>
					<Show when={blockView() === "stitches"}>
						<ScarfView
							scene={blockScene()}
							picked={-1}
							turn={0}
							flipped={flipped()}
							lines={false}
							onPick={() => {}}
						/>
					</Show>
					<Show when={blockView() === "yarn"}>
						<KnitscapeView
							response={blockSettled()}
							yarn={doc()?.yarn || YARNS[0]}
							plating={doc()?.plating ?? null}
							page={colours().page}
							flipped={flipped()}
							busy={blockSettling()}
							picked={-1}
							lines={false}
							onPick={() => {}}
						/>
					</Show>
					<Show when={blockView() === "knitting"}>
						<LatticeView
							file="animation.js"
							url={`${handle.url}#block`}
							knitout={blockKnitout()}
							yarn={doc()?.yarn || YARNS[0]}
							plating={doc()?.plating ?? null}
							lines={[]}
							onPick={() => {}}
						/>
					</Show>
					<Show when={blockView() === "3d"}>
						<LatticeView
							file="knit3d.js"
							url={`${handle.url}#block`}
							knitout={blockKnitout()}
							yarn={doc()?.yarn || YARNS[0]}
							plating={doc()?.plating ?? null}
							lines={[]}
							onPick={() => {}}
						/>
					</Show>
				</div>

				<div class="knitfold-code" ref={codeBox}>
					<Show when={pickedFile()} keyed>
						{url => <CodePane url={url} />}
					</Show>
				</div>

				<Show when={problemText()}>
					<div class="knitfold-problem" role="status">
						{problemText()}
					</div>
				</Show>
			</aside>

			<nav class="knitfold-pages" aria-label="pages">
				<button aria-pressed={page() === "scarf" ? "true" : "false"} onClick={() => setPage("scarf")}>
					scarf
				</button>
				<button aria-pressed={page() === "block" ? "true" : "false"} onClick={() => setPage("block")}>
					block
				</button>
			</nav>

			<button
				class="knitfold-toolbutton knitfold-turnover"
				title={flipped() ? "turn it back over: the front" : "turn it over: the back"}
				aria-label="turn it over"
				aria-pressed={flipped() ? "true" : "false"}
				onClick={() => setFlipped(f => !f)}>
				<Icon name="turnover" />
			</button>
		</div>
	)
}
