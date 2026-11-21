// knitfold's icons: 1-bit, on a 16 by 16 grid, a pixel a square, as the
// xerox alto's were. each's drawn here, pixel by pixel, and made an svg of
// its runs of pixels (drawn crisp: shape-rendering crispEdges). `#` is ink,
// `+` the icon's colour (a yarn cone's yarn: var(--c))

type Pixels = string[]

function blank(): string[][] {
	return Array.from({length: 16}, () => Array(16).fill("."))
}

function draw(paint: (set: (x: number, y: number, ink?: string) => void) => void): Pixels {
	const grid = blank()
	paint((x, y, ink = "#") => {
		if (x >= 0 && x < 16 && y >= 0 && y < 16) grid[y][x] = ink
	})
	return grid.map(row => row.join(""))
}

const line = (set: (x: number, y: number) => void, x0: number, y0: number, x1: number, y1: number) => {
	const dx = Math.abs(x1 - x0)
	const dy = -Math.abs(y1 - y0)
	const sx = x0 < x1 ? 1 : -1
	const sy = y0 < y1 ? 1 : -1
	let error = dx + dy
	for (;;) {
		set(x0, y0)
		if (x0 === x1 && y0 === y1) return
		const twice = 2 * error
		if (twice >= dy) {
			error += dy
			x0 += sx
		}
		if (twice <= dx) {
			error += dx
			y0 += sy
		}
	}
}

const PIXELS = {
	add: draw(set => {
		line(set, 7, 2, 7, 12)
		line(set, 2, 7, 12, 7)
	}),
	remove: draw(set => {
		line(set, 6, 1, 8, 1)
		line(set, 2, 2, 12, 2)
		line(set, 3, 4, 3, 11)
		line(set, 11, 4, 11, 11)
		line(set, 4, 12, 10, 12)
		line(set, 6, 5, 6, 10)
		line(set, 8, 5, 8, 10)
	}),
	// a triangle and its reflection, across a dotted line
	flip: draw(set => {
		for (let y = 1; y <= 14; y += 2) set(7, y)
		for (let y = 3; y <= 12; y++) {
			const reach = Math.round((y - 3) * 0.45)
			for (let x = 5 - reach; x <= 5; x++) set(x, y)
			set(9, y)
			set(9 + reach, y)
		}
		line(set, 9, 12, 9 + Math.round(9 * 0.45), 12)
	}),
	// turning it over: a ring, as seen lying down, open at the top, its left
	// end coming round into an arrowhead pointing across the gap. drawn
	// pixel by pixel
	turnover: [
		"................",
		"................",
		"................",
		"......#.........",
		".......#........",
		"........#.......",
		"..#######....#..",
		".#......#.....#.",
		"#......#.......#",
		"#.....#........#",
		"#..............#",
		".#............#.",
		"..##........##..",
		"....########....",
		"................",
		"................",
	],
	// a block of stitches, three by three
	size: draw(set => {
		for (const at of [2, 6, 10, 14]) {
			line(set, at, 2, at, 14)
			line(set, 2, at, 14, at)
		}
	}),
	download: draw(set => {
		line(set, 7, 1, 7, 9)
		line(set, 4, 6, 7, 9)
		line(set, 10, 6, 7, 9)
		line(set, 2, 10, 2, 13)
		line(set, 12, 10, 12, 13)
		line(set, 2, 13, 12, 13)
	}),
	// a cone of yarn: its tube at the top, the yarn wound round it, wider
	// as it goes down
	cone: draw(set => {
		set(6, 0)
		set(7, 0)
		set(8, 0)
		set(6, 1)
		set(8, 1)
		line(set, 5, 2, 9, 2)
		for (let y = 3; y <= 13; y++) {
			const half = 2 + Math.floor((y - 2) / 3)
			set(7 - half, y)
			set(7 + half, y)
			// (the winding: a stroke every few pixels, kept off the edges)
			for (let x = 8 - half; x < 7 + half; x++) {
				const inside = x > 8 - half && x < 6 + half
				set(x, y, inside && (x + 2 * y) % 5 === 0 ? "#" : "+")
			}
		}
		line(set, 1, 14, 13, 14)
	}),
	// the views. chart: squares, some with a purl's dash in them
	chart: draw(set => {
		for (const at of [1, 5, 9, 13]) {
			line(set, at, 1, at, 13)
			line(set, 1, at, 13, at)
		}
		line(set, 2, 3, 4, 3)
		line(set, 10, 3, 12, 3)
		line(set, 6, 7, 8, 7)
		line(set, 2, 11, 4, 11)
		line(set, 10, 11, 12, 11)
	}),
	// stitches: two knits, as charts draw them
	stitches: draw(set => {
		line(set, 1, 4, 4, 11)
		line(set, 4, 11, 7, 4)
		line(set, 8, 4, 11, 11)
		line(set, 11, 11, 14, 4)
	}),
	// yarn: a ball of it
	yarn: draw(set => {
		const [cx, cy, r] = [7, 8, 6]
		let x = r
		let y = 0
		let error = 1 - r
		while (x >= y) {
			for (const [dx, dy] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) set(cx + dx, cy + dy)
			y++
			if (error < 0) error += 2 * y + 1
			else {
				x--
				error += 2 * (y - x) + 1
			}
		}
		line(set, 3, 5, 9, 13)
		line(set, 5, 3, 12, 11)
		line(set, 2, 9, 6, 13)
	}),
	// knitting: a latch needle, its hook and its latch
	knitting: draw(set => {
		line(set, 8, 4, 8, 14)
		set(8, 3)
		set(7, 2)
		set(6, 2)
		set(5, 3)
		set(5, 4)
		set(6, 5)
		line(set, 9, 6, 11, 10)
	}),
	// 3d: a cube
	"3d": draw(set => {
		line(set, 7, 1, 13, 4)
		line(set, 13, 4, 7, 7)
		line(set, 7, 7, 1, 4)
		line(set, 1, 4, 7, 1)
		line(set, 1, 4, 1, 11)
		line(set, 13, 4, 13, 11)
		line(set, 7, 7, 7, 14)
		line(set, 1, 11, 7, 14)
		line(set, 7, 14, 13, 11)
	}),
	// no cone: its outline, dotted
	nocone: draw(set => {
		for (let y = 3; y <= 13; y += 2) {
			const half = 2 + Math.floor((y - 2) / 3)
			set(7 - half, y)
			set(7 + half, y)
		}
		for (let x = 1; x <= 13; x += 2) set(x, 14)
		for (let x = 5; x <= 9; x += 2) set(x, 2)
	}),
}

export type IconName = keyof typeof PIXELS

// a run of pixels of one kind, a rectangle in a path
function pathOf(pixels: Pixels, kind: string) {
	let d = ""
	pixels.forEach((row, y) => {
		for (let x = 0; x < 16; x++) {
			if (row[x] !== kind) continue
			let end = x
			while (row[end + 1] === kind) end++
			d += `M${x} ${y}h${end - x + 1}v1h${-(end - x + 1)}z`
			x = end
		}
	})
	return d
}

export const ICONS = Object.fromEntries(
	Object.entries(PIXELS).map(([name, pixels]) => [
		name,
		`<path d="${pathOf(pixels, "#")}" fill="currentColor"/><path d="${pathOf(pixels, "+")}" style="fill: var(--c, transparent)"/>`,
	]),
) as Record<IconName, string>
