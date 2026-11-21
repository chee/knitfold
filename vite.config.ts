import {defineConfig} from "vite"
import patchwork from "@inkandswitch/patchwork/vite"

// the site: patchwork, booted with pkg-base's packages and knitfold's own
// (packages/knitfold, built into its dist and mounted at /packages/knitfold).
// knitfold's frame is the root view, on knitfold's paper
export default defineConfig({
	plugins: [
		patchwork({
			title: "Knitfold",
			description: "knit a scarf in blocks of code",
			storagePrefix: "knitfold.patchwork.inkandswitch.com",
			themeColor: {light: "#fcf7f2", dark: "#22212d"},
			html: {
				attributes: {
					"data-theme-light": "knitfold-paper",
					"data-theme-dark": "knitfold-night",
				},
			},
			icons: {source: "public/knitfold.svg"},
			static: [
				{from: "./packages/knitfold/dist", to: "/packages/knitfold/", watch: ".watch-ready"},
				"@inkandswitch/patchwork-pkg-base",
			],
			// (as lattice: vite's cors middleware adds `Vary: Origin`, which
			// netlify doesn't, and the service worker caches under it)
			preview: {cors: false},
		}),
	],
})
