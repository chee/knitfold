import {parser} from "@lezer/javascript"
import type {SyntaxNode} from "@lezer/common"

// every statement's an expression, as eval has it: a block's code gives back
// the value of the last thing it did. `if (x) {s} else {g}` is s or g;
// `let k = x % 4\nk ? s : g` is k ? s : g; a loop's is its body's last.
//
// (eval would say so itself, but it'd read the code again for every stitch:
// so the code's rewritten once instead, `return` put before each statement a
// run can end on. a loop's body keeps what it came to in COMPLETION, and the
// loop's followed by a return of it)

const COMPLETION = "__knitfold_completion"

const NOT_STATEMENTS = new Set(["LineComment", "BlockComment", "{", "}", ";", "⚠"])
const LOOPS = new Set(["ForStatement", "WhileStatement", "DoStatement"])

type Mode = "return" | "keep"
interface Edit {
	at: number
	text: string
}

function children(node: SyntaxNode) {
	const all: SyntaxNode[] = []
	for (let child = node.firstChild; child; child = child.nextSibling) all.push(child)
	return all
}

const statements = (node: SyntaxNode) => children(node).filter(child => !NOT_STATEMENTS.has(child.name))

export function withCompletion(code: string) {
	const tree = parser.parse(code)
	let broken = false
	tree.iterate({enter: node => void (node.type.isError && (broken = true))})
	// (it won't run anyway: let it say why as it's written)
	if (broken) return code

	const edits: Edit[] = []
	let loops = false

	function tail(node: SyntaxNode | undefined, mode: Mode) {
		if (!node) return
		switch (node.name) {
			case "ExpressionStatement": {
				const expression = node.firstChild!
				edits.push({at: expression.from, text: mode === "return" ? "return (" : `${COMPLETION} = (`})
				edits.push({at: expression.to, text: ")"})
				return
			}
			case "Block":
			case "LabeledStatement":
				return tail(statements(node).at(-1), mode)
			case "IfStatement":
				// (the statements after its condition: then, and else)
				for (const branch of statements(node).filter(child => !["if", "else", "ParenthesizedExpression"].includes(child.name))) {
					tail(branch, mode)
				}
				return
			case "TryStatement": {
				const [block] = statements(node).filter(child => child.name === "Block")
				tail(block, mode)
				const handler = statements(node).find(child => child.name === "CatchClause")
				if (handler) tail(statements(handler).find(child => child.name === "Block"), mode)
				return
			}
			case "SwitchStatement": {
				const body = statements(node).find(child => child.name === "SwitchBody")
				if (!body) return
				// each case: what's from its label to the next. one that ends in a
				// break ends on what's before it; one that falls through doesn't end
				const cases: SyntaxNode[][] = []
				for (const child of statements(body)) {
					if (child.name === "CaseLabel" || child.name === "DefaultLabel") cases.push([])
					else cases.at(-1)?.push(child)
				}
				cases.forEach((body, n) => {
					const last = body.at(-1)
					if (last?.name === "BreakStatement") tail(body.at(-2), mode)
					else if (n === cases.length - 1) tail(last, mode)
				})
				return
			}
		}
		if (LOOPS.has(node.name)) {
			const body = node.name === "DoStatement" ? statements(node)[1] : statements(node).at(-1)
			tail(body, "keep")
			loops = true
			if (mode === "return") edits.push({at: node.to, text: `\nreturn ${COMPLETION}`})
		}
		// (anything else, a declaration, a return of its own: nothing to give)
	}

	const top = tree.topNode
	tail(statements(top).at(-1), "return")
	if (!edits.length) return code
	let out = code
	// (from the end: and where two go in at one place, the one put in later
	// goes in first, so it ends up after: an expression's `)`, then a loop's
	// return)
	const ordered = edits.map((edit, n) => ({...edit, n})).sort((a, b) => b.at - a.at || b.n - a.n)
	for (const edit of ordered) out = out.slice(0, edit.at) + edit.text + out.slice(edit.at)
	return loops ? `var ${COMPLETION}\n${out}` : out
}
