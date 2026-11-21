import {Presence, type DocHandle} from "@automerge/automerge-repo"
import {createSignal} from "solid-js"

// who else is here, gently: which block each of them is looking at, whether
// they're in its code, and where their mouse is over the scarf. said over the
// scarf's own presence (nothing's kept: it's gone when they are)

export interface Here {
	/** the block they've picked */
	block: number
	/** in the block's code: their needle's there, so the one by the block isn't */
	typing: boolean
	/** where their mouse is over the scarf, in its own units (so it's where
	 * they are whichever way you've moved it), or not over it */
	at: readonly [number, number] | null
}

export interface Other extends Here {
	peerId: string
}

// each of them a cream of their own: picked by their peer id, so it's the
// same cream everywhere they're seen (their dot, and their needle in the
// file tool's code, which knows them by the same id). from the palest to
// a deep oat
export function creamOf(peerId: string) {
	let hash = 0x811c9dc5
	for (let i = 0; i < peerId.length; i++) hash = Math.imul(hash ^ peerId.charCodeAt(i), 0x01000193)
	const t = (hash >>> 0) / 0xffffffff
	return `oklch(${(0.97 - t * 0.2).toFixed(3)} ${(0.025 + t * 0.05).toFixed(3)} ${(85 - t * 15).toFixed(1)})`
}

function pointAt(at: unknown) {
	return Array.isArray(at) && at.length === 2 && at.every(n => Number.isFinite(n)) ? ([at[0], at[1]] as const) : null
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
					at: pointAt(peer.value.at),
				}))
				.sort((a, b) => (a.peerId < b.peerId ? -1 : 1)),
		)
	const events = ["update", "snapshot", "goodbye", "pruned"] as const
	for (const event of events) presence.on(event, refresh)
	presence.start({initialState: initial, heartbeatMs: 2_000, peerTtlMs: 10_000})
	const stop = () => presence.running && presence.stop()
	addEventListener("pagehide", stop)

	return {
		others,
		say<K extends keyof Here>(key: K, value: Here[K]) {
			if (presence.running && presence.getLocalState()[key] !== value) presence.broadcast(key, value)
		},
		stop() {
			removeEventListener("pagehide", stop)
			for (const event of events) presence.off(event, refresh)
			stop()
		},
	}
}
