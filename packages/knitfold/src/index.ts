// nothing imported up here: patchwork reads this list in a worker, which has
// no import map. what each plugin needs, its load() imports

const theme = (file: string) => new URL(/* @vite-ignore */ `./themes/${file}`, import.meta.url).href

export const plugins = [
	{
		type: "patchwork:datatype",
		id: "knitfold",
		name: "Knitfold Scarf",
		icon: "Shirt",
		async load() {
			return (await import("./datatype.ts")).KnitfoldDatatype
		},
	},
	{
		type: "patchwork:tool",
		id: "knitfold",
		name: "Knitfold",
		icon: "Shirt",
		supportedDatatypes: ["knitfold"],
		async load() {
			return (await import("./tool.tsx")).default
		},
	},
	// the site's frame: a scarf, all the page
	{
		type: "patchwork:tool",
		id: "knitfold-frame",
		name: "Knitfold Frame",
		icon: "Shirt",
		supportedDatatypes: ["account", "folder"],
		tags: ["frame-tool"],
		async load() {
			return (await import("./frame.tsx")).default
		},
	},
	{
		type: "patchwork:theme",
		id: "knitfold-paper",
		name: "Knitfold Paper",
		colorScheme: "light",
		style: theme("paper.css"),
		async load() {
			return {}
		},
	},
	{
		type: "patchwork:theme",
		id: "knitfold-night",
		name: "Knitfold Night",
		colorScheme: "dark",
		style: theme("paper.css"),
		async load() {
			return {}
		},
	},
	{
		type: "patchwork:theme",
		id: "chee-party",
		name: "chee.party",
		colorScheme: "light",
		style: theme("chee-party.css"),
		async load() {
			return {}
		},
	},
	{
		type: "patchwork:theme",
		id: "chee-party-dark",
		name: "chee.party (night)",
		colorScheme: "dark",
		style: theme("chee-party.css"),
		async load() {
			return {}
		},
	},
]
