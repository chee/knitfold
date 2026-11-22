import {parser} from "@lezer/javascript"
import type {SyntaxNode, Tree} from "@lezer/common"

// a const is once: a block's code runs for every stitch, but what it says
// is const, at the top of it, is worked out the first time and kept for the
// rest of the block (`const loudest = max(...levels)`, for 4096 stitches,
// once). a let's every stitch's own.
//
// (unless the const can't be the same for every stitch: it says x, y, i,
// col, row or t, or a let, or something that does. then it's every
// stitch's, as a let is. and a const that's once is once: `const r =
// random()` is one number for the whole block)
//
// it's done as the code's read: each const that can be once has what it's
// made of wrapped, `const k = ONCE(n, () => (…))`, and ONCE (stitches.ts)
// keeps what it gives back the first time

export const ONCE = "__knitfold_once"

/** what a stitch is: what's every stitch's own */
const STITCH = ["x", "y", "i", "col", "row", "t"]

function children(node: SyntaxNode) {
	const all: SyntaxNode[] = []
	for (let child = node.firstChild; child; child = child.nextSibling) all.push(child)
	return all
}

interface Made {
	/** the names it makes */
	names: string[]
	/** the names it says, in what it's made of */
	says: Set<string>
}

export function withConstants(code: string) {
	const tree: Tree = parser.parse(code)
	let broken = false
	tree.iterate({enter: node => void (node.type.isError && (broken = true))})
	if (broken) return code

	// every name (said, or made) in a piece of the code
	const namesIn = (node: SyntaxNode, kind: "VariableName" | "VariableDefinition") => {
		const found = new Set<string>()
		tree.iterate({
			from: node.from,
			to: node.to,
			enter: ref => {
				if (ref.name === kind && ref.from >= node.from && ref.to <= node.to) found.add(code.slice(ref.from, ref.to))
			},
		})
		return found
	}

	// what's every stitch's own: the stitch, and the top's lets and vars
	const own = new Set(STITCH)
	// what might be: each function and class at the top, and each const's
	// `name = value`
	const made: Made[] = []
	const constants: (Made & {value: SyntaxNode})[] = []

	for (const statement of children(tree.topNode)) {
		if (statement.name === "FunctionDeclaration" || statement.name === "ClassDeclaration") {
			const definition = children(statement).find(child => child.name === "VariableDefinition")
			if (definition) made.push({names: [code.slice(definition.from, definition.to)], says: namesIn(statement, "VariableName")})
			continue
		}
		if (statement.name !== "VariableDeclaration") continue
		if (statement.firstChild?.name !== "const") {
			for (const name of namesIn(statement, "VariableDefinition")) own.add(name)
			continue
		}
		// a const's parts: a pattern, =, a value, and again after each comma
		let pattern: SyntaxNode | null = null
		for (const part of children(statement)) {
			if (["const", ",", ";", "Equals"].includes(part.name)) continue
			if (!pattern) {
				pattern = part
				continue
			}
			const declarator = {names: [...namesIn(pattern, "VariableDefinition")], says: namesIn(part, "VariableName"), value: part}
			made.push(declarator)
			constants.push(declarator)
			pattern = null
		}
	}

	// anything that says something that's every stitch's own is too (round
	// again, till nothing more is)
	for (let more = true; more; ) {
		more = false
		for (const {names, says} of made) {
			if (names.every(name => own.has(name))) continue
			if ([...says].some(name => own.has(name))) {
				for (const name of names) own.add(name)
				more = true
			}
		}
	}

	// and each const that isn't, once
	const edits: {at: number; text: string}[] = []
	constants.forEach(({names, value}, n) => {
		if (names.some(name => own.has(name))) return
		edits.push({at: value.from, text: `${ONCE}(${n}, () => (`})
		edits.push({at: value.to, text: "))"})
	})
	let out = code
	for (const edit of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, edit.at) + edit.text + out.slice(edit.at)
	return out
}
