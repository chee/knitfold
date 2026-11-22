// a block's little sums, after canvas-sketch-util's math.js: but each with
// what it works on first, so what's after it can be left off, and left off,
// it's the techniques' range, 0 to 6 (so `lerp(t)` is a technique, and
// `clamp(n)` is too). and remap, to take one range to another: an image's
// width to the block's, say, `remap(x, 0, w, 0, pic.width)`

const EPSILON = Number.EPSILON

/** from min to max, t of the way (t 0 is min, 1 is max) */
export function lerp(t: number, min = 0, max = 6) {
	return min * (1 - t) + max * t
}

/** how far value is from min to max: lerp's other way (0 at min, 1 at max) */
export function perl(value: number, min = 0, max = 6) {
	return Math.abs(min - max) < EPSILON ? 0 : (value - min) / (max - min)
}

/** value, kept between min and max */
export function clamp(value: number, min = 0, max = 6) {
	return min < max ? Math.min(max, Math.max(min, value)) : Math.min(min, Math.max(max, value))
}

/** a's remainder, by n: never less than 0, even when a is (so it goes round) */
export function mod(a: number, n = 7) {
	return ((a % n) + n) % n
}

/** degrees, in radians */
export function d2r(degrees: number) {
	return (degrees * Math.PI) / 180
}

/** radians, in degrees */
export function r2d(radians: number) {
	return (radians * 180) / Math.PI
}

/** value, from one range (inMin to inMax) to another (outMin to outMax).
 * clamped, it's kept in the other */
export function remap(value: number, inMin: number, inMax: number, outMin = 0, outMax = 6, clamped = false) {
	const out = lerp(perl(value, inMin, inMax), outMin, outMax)
	return clamped ? clamp(out, outMin, outMax) : out
}

export const HELPERS = {lerp, perl, clamp, mod, d2r, r2d, remap}

// and as the language server's told of them (declarations.ts)
export const HELPER_DECLARATIONS = `/** from min to max, t of the way: t 0 is min, 1 is max. min and max are
 * 0 and 6 if they're left off (so it's a technique) */
declare function lerp(t: number, min?: number, max?: number): number
/** how far value is from min to max, 0 to 1 (lerp's other way). min and
 * max are 0 and 6 if they're left off */
declare function perl(value: number, min?: number, max?: number): number
/** value, kept between min and max: 0 and 6 if they're left off */
declare function clamp(value: number, min?: number, max?: number): number
/** a's remainder by n, never less than 0 (so it goes round). n's 7 if
 * it's left off: each technique in turn */
declare function mod(a: number, n?: number): number
/** degrees, in radians */
declare function d2r(degrees: number): number
/** radians, in degrees */
declare function r2d(radians: number): number
/** value, from one range to another: \`remap(x, 0, w, 0, pic.width)\` is the
 * picture's x for the block's. the other's 0 to 6 if it's left off;
 * clamped, it's kept in it */
declare function remap(value: number, inMin: number, inMax: number, outMin?: number, outMax?: number, clamped?: boolean): number`
