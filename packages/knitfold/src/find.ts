import {parseAutomergeUrl, type AutomergeUrl, type DocHandle} from "@automerge/automerge-repo"

// a doc, found: or, when it can't be (nobody that's here has it, yet: a
// block someone's only just made, or a server that's slow), found again in a
// while, and again, a little longer each time, for as long as it's wanted.
// (the repo keeps a find that failed, failed: so it's forgotten first)

const FIRST = 2_000
const LONGEST = 30_000

export async function findPatiently<T>(
	url: AutomergeUrl,
	options: {
		/** not wanted any more: stop looking */
		gone?: () => boolean
		/** it isn't here (each time it isn't) */
		missing?: (error: unknown) => void
	} = {},
): Promise<DocHandle<T> | null> {
	const gone = options.gone ?? (() => false)
	for (let wait = FIRST; ; wait = Math.min(wait * 2, LONGEST)) {
		try {
			return await window.repo.find<T>(url)
		} catch (error) {
			if (gone()) return null
			console.warn(`knitfold: ${url} isn't here; looking again in ${wait / 1000}s`, error)
			options.missing?.(error)
			await new Promise(resolve => setTimeout(resolve, wait))
			if (gone()) return null
			await window.repo.removeFromCache(parseAutomergeUrl(url).documentId)
		}
	}
}
