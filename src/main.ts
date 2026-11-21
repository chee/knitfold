import setup, {
	hideLoadingAnimation,
	showErrorScreen,
	showLoadingAnimation,
} from "@inkandswitch/patchwork"

// pkg-base's packages (the site's /modules.json, mounted from
// @inkandswitch/patchwork-pkg-base), and knitfold's own beside them
const KNITFOLD = new URL("/packages/knitfold/modules.json", location.href).href

showLoadingAnimation()

const packageListURL = [
	...(
		new URLSearchParams(location.search).get("system-package-list") ||
		import.meta.env.PATCHWORK_SYSTEM_PACKAGE_LIST_URL ||
		"/modules.json"
	)
		.split(",")
		.map((source: string) => source.trim())
		.filter(Boolean),
	KNITFOLD,
]

window.patchwork = await setup({
	packageListURL,
	accountKey: "knitfoldPatchworkAccountUrl",
	frameToolId: "knitfold-frame",
}).catch(error => {
	showErrorScreen(error, {contact: "chee@inkandswitch.com"})
	throw error
})

hideLoadingAnimation()
