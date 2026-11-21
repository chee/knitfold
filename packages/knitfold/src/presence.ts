import {Presence, type DocHandle} from "@automerge/automerge-repo"
import {createSignal} from "solid-js"
import {pointerFrom, type Pointer} from "./anchor.ts"

// who else is here, gently: which block each of them is looking at, whether
// they're in its code, and where their mouse is, over what (anchor.ts). said
// over the scarf's own presence, on its ephemeral channel (nothing's kept:
// it's gone when they are)
//
// automerge-repo's Presence forgets anyone it's only had heartbeats from for
// its ttl (a heartbeat says they're there, but not that they're active), and
// then it's only what they say next it has of them, not all of it: so all
// of yours goes out again every AGAIN, and as you come back to the tab

const HEARTBEAT = 2_000
const TTL = 10_000
const AGAIN = 3_000

export interface Here {
	/** the block they've picked */
	block: number
	/** in the block's code: their needle's there, so the one by the block isn't */
	typing: boolean
	/** where their mouse (or finger) is, over what, or that it's not here */
	pointer: Pointer | null
}

export interface Other extends Here {
	peerId: string
}

// each of them a cream of their own: picked by their peer id, so it's the
// same cream everywhere they're seen (their ball and needle here, and their
// needle in the file tool's code, which knows them by the same id). from the
// palest to a deep oat
export function creamOf(peerId: string) {
	let hash = 0x811c9dc5
	for (let i = 0; i < peerId.length; i++) hash = Math.imul(hash ^ peerId.charCodeAt(i), 0x01000193)
	const t = (hash >>> 0) / 0xffffffff
	return `oklch(${(0.97 - t * 0.2).toFixed(3)} ${(0.025 + t * 0.05).toFixed(3)} ${(85 - t * 15).toFixed(1)})`
}

export function scarfPresence(handle: DocHandle<unknown>, initial: Here) {
	const presence = new Presence<Here>({handle})
	const [others, setOthers] = createSignal<Other[]>([])
	const refresh = () =>
		setOthers(
			presence
				.getPeerStates()
				.peers.filter(peer => typeof peer.value?.block === "number")
				.map(peer => ({
					peerId: String(peer.peerId),
					block: peer.value.block,
					typing: !!peer.value.typing,
					pointer: pointerFrom(peer.value.pointer),
				}))
				.sort((a, b) => (a.peerId < b.peerId ? -1 : 1)),
		)
	const events = ["update", "snapshot", "goodbye", "pruned"] as const
	for (const event of events) presence.on(event, refresh)
	presence.start({initialState: initial, heartbeatMs: HEARTBEAT, peerTtlMs: TTL})
	// (it's private in Presence's types, but it's the one that sends all of it)
	const everything = () => {
		if (presence.running) (presence as unknown as {broadcastLocalState(): void}).broadcastLocalState()
	}
	const again = setInterval(everything, AGAIN)
	const onVisible = () => document.visibilityState === "visible" && everything()
	document.addEventListener("visibilitychange", onVisible)
	const stop = () => presence.running && presence.stop()
	addEventListener("pagehide", stop)

	return {
		others,
		say<K extends keyof Here>(key: K, value: Here[K]) {
			const now = presence.getLocalState()[key]
			if (presence.running && JSON.stringify(now) !== JSON.stringify(value)) presence.broadcast(key, value)
		},
		stop() {
			clearInterval(again)
			document.removeEventListener("visibilitychange", onVisible)
			removeEventListener("pagehide", stop)
			for (const event of events) presence.off(event, refresh)
			stop()
		},
	}
}
