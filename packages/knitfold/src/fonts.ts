import regular from "./fonts/iosevka-rabbits-regular.woff2?url"
import italic from "./fonts/iosevka-rabbits-italic.woff2?url"
import light from "./fonts/iosevka-rabbits-light.woff2?url"
import lightItalic from "./fonts/iosevka-rabbits-lightitalic.woff2?url"
import bold from "./fonts/iosevka-rabbits-bold.woff2?url"
import boldItalic from "./fonts/iosevka-rabbits-bolditalic.woff2?url"

// knitfold's one font, Iosevka Rabbits, for everything: its six faces,
// cut down to latin (and arrows, maths, box drawing). they're the tool's
// own, so they come with it whatever the theme. each is fetched only when
// something's set in it

const FACES = [
	[regular, 400, "normal"],
	[italic, 400, "italic"],
	[light, 300, "normal"],
	[lightItalic, 300, "italic"],
	[bold, 700, "normal"],
	[boldItalic, 700, "italic"],
] as const

let added = false
export function addFonts() {
	if (added) return
	added = true
	const style = document.createElement("style")
	style.dataset.knitfold = "fonts"
	style.textContent = FACES.map(
		([url, weight, slant]) =>
			`@font-face{font-family:"Iosevka Rabbits";src:url(${JSON.stringify(new URL(url, import.meta.url).href)}) format("woff2");font-weight:${weight};font-style:${slant};font-display:swap}`,
	).join("\n")
	document.head.append(style)
}
