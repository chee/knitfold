import {writeFileSync} from "node:fs"
import {defineConfig, type Plugin} from "vite"
import solid from "@solidjs/vite-plugin"
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js"
import patchworkExternals from "@inkandswitch/patchwork-bootloader/externals"

// patchwork's import map has solid 1, and knitfold's on solid 2: its own
// solid's bundled in, and everything else of patchwork's stays external
const externals = patchworkExternals.filter(name => name !== "solid-js" && !name.startsWith("solid-js/"))

// the site's dev server reloads when this is touched (vite.config.ts at the
// root: its static source's `watch`)
function watchReady(): Plugin {
	return {
		name: "knitfold-watch-ready",
		closeBundle() {
			writeFileSync("dist/.watch-ready", String(Date.now()))
		},
	}
}

export default defineConfig({
	base: "./",
	plugins: [solid(), cssInjectedByJsPlugin({relativeCSSInjection: true}), watchReady()],
	worker: {format: "es"},
	build: {
		sourcemap: true,
		cssCodeSplit: true,
		emptyOutDir: true,
		minify: false,
		// (the entry module is read in a worker: no preload helper in it)
		modulePreload: false,
		target: "esnext",
		rollupOptions: {
			external: externals,
			input: "./src/index.ts",
			output: {
				format: "es",
				entryFileNames: "[name].js",
				chunkFileNames: "assets/[name]-[hash].js",
				assetFileNames: "assets/[name][extname]",
			},
			preserveEntrySignatures: "strict",
		},
	},
})
