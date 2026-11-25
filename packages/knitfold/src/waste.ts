// a waste section, to start the scarf on: Agnes Cameron's, from her
// kniterate visualiser (agnescameron/knitout-visualizer-kniterate). waste
// yarn (carrier 6) tucked in and knitted, a draw thread (carrier 1), the
// main yarns brought in, a tube, the back bed dropped, the draw thread again
// and out, then the cast on (the main yarn across both beds at half
// racking), everything transferred to the front bed, and the waste yarn out.
// after it, the main yarn's in, on the left, every loop's on the front bed,
// at racking 0: as knitfold's own cast on leaves it.
//
// it's her code as she wrote it, but for what's marked //knitfold: it
// writes knitout lines through a little writer of knitfold's (the scarf's
// .k is made of lines, in a worker, and in node's tests), not knitout.js's;
// there's no window to alert in, or console to log to; and it's a function
// of its own, not the module's lets

/** what of a knitout.js writer the waste section writes with */
export interface WasteWriter {
	in(carrier: string): void
	out(carrier: string): void
	knit(dir: string, needle: string, carrier: string): void
	tuck(dir: string, needle: string, carrier: string): void
	miss(dir: string, needle: string, carrier: string): void
	drop(needle: string): void
	xfer(from: string, to: string): void
	rack(racking: number): void
	comment(text: string): void
	speedNumber(value: number): void
	rollerAdvance(value: number): void
	stitchNumber(value: number): void
}

//knitfold: knitout lines, as knitout.js's writer would write them
export function lineWriter(lines: string[]): WasteWriter {
	return {
		in: carrier => lines.push(`in ${carrier}`),
		out: carrier => lines.push(`out ${carrier}`),
		knit: (dir, needle, carrier) => lines.push(`knit ${dir} ${needle} ${carrier}`),
		tuck: (dir, needle, carrier) => lines.push(`tuck ${dir} ${needle} ${carrier}`),
		miss: (dir, needle, carrier) => lines.push(`miss ${dir} ${needle} ${carrier}`),
		drop: needle => lines.push(`drop ${needle}`),
		xfer: (from, to) => lines.push(`xfer ${from} ${to}`),
		rack: racking => lines.push(`rack ${racking}`),
		//knitfold: (a ;; line is a header: a comment's one ;)
		comment: text => lines.push(`; ${text.replace(/^;+/, "")}`),
		speedNumber: value => lines.push(`x-speed-number ${value}`),
		rollerAdvance: value => lines.push(`x-roller-advance ${value}`),
		stitchNumber: value => lines.push(`x-stitch-number ${value}`),
	}
}

//------------------------------------

// add menu for selecting these
// these are the kniterate settings
const defaultRollerAdvance = 450
const defaultStitchNumber = 5
const defaultSpeedNumber = 400
const defaultWasteCarrier = "6"
const defaultDrawCarrier = "1"
const defaultCastonStyle = 2

const wastePasses = 71
const tubeRows = 5

interface Carrier {
	id: string
	position: "L" | "R"
	castOn: boolean
	role: string | null
	isMainYarn: boolean
	dir: "+" | "-"
}

class CarrierSet {
	carriers: Carrier[]
	// position is always L at the start
	constructor(carriers: Partial<Carrier>[]) {
		this.carriers = carriers.map(c => ({position: "L", castOn: false, role: null, isMainYarn: false, dir: "+", ...c}) as Carrier)
	}

	// roles -- need to know cast-on drawthread etc.
	// if there are duplicates here, need to change mode
	get castOn() {
		return this.carriers.find(c => c.castOn)
	}
	get drawThread() {
		return this.carriers.find(c => c.role === "drawThread")
	}
	get waste() {
		return this.carriers.find(c => c.role === "waste")
	}
	get mainYarns() {
		return this.carriers.filter(c => c.isMainYarn)
	}

	// lookup
	get(id: string) {
		return this.carriers.find(c => c.id === id)
	}

	// set the position (happens every row)
	setPosition(id: string, side: "L" | "R") {
		const carrier = this.carriers.find(c => c.id === id)
		if (!carrier) throw new Error(`Carrier ${id} not found`)
		carrier.position = side
	}

	// set the position (happens every row)
	setMain(id: string, main: boolean) {
		const carrier = this.carriers.find(c => c.id === id)
		if (!carrier) throw new Error(`Carrier ${id} not found`)
		carrier.isMainYarn = main
	}

	// set the direction they get introduced
	setDir(id: string, dir: "+" | "-") {
		const carrier = this.carriers.find(c => c.id === id)
		if (!carrier) throw new Error(`Carrier ${id} not found`)
		carrier.dir = dir
	}

	// change a carrier's role
	setRole(id: string, role: string) {
		const carrier = this.carriers.find(c => c.id === id)
		if (!carrier) throw new Error(`Carrier ${id} not found`)
		carrier.role = role
	}

	// add a carrier to the carrier set
	push(carrier: Partial<Carrier> & {id: string}) {
		if (this.carriers.some(c => c.id === carrier.id)) {
			throw new Error(`Carrier ${carrier.id} already exists`)
		}
		this.carriers.push({position: "L", castOn: false, role: null, isMainYarn: false, dir: "+", ...carrier} as Carrier)
	}
}

function generateWasteSection(
	k: WasteWriter,
	carrierSet: CarrierSet,
	wasteMin: number,
	wasteMax: number,
	wasteCarrier: string,
	drawCarrier: string,
) {
	// slow for the first bit
	k.speedNumber(300)
	k.rollerAdvance(450)

	carrierSet.carriers.forEach((carrier, i) => {
		k.in(carrier.id)

		// tuck each carrier in turn
		for (let n = wasteMin; n <= wasteMax; ++n) {
			const bed = (Math.abs(n) + i) % 2 === 0 ? "f" : "b"
			if (Math.abs(n) % carrierSet.carriers.length === i) {
				k.tuck("+", bed + n, carrier.id)
			} else if (n === wasteMax) {
				k.miss("+", bed + n, carrier.id)
			}
		}

		for (let n = wasteMax; n >= wasteMin; --n) {
			const bed = (Math.abs(n) + i) % 2 === 0 ? "b" : "f"
			if (Math.abs(n) % carrierSet.carriers.length === i) {
				k.tuck("-", bed + n, carrier.id)
			} else if (n === wasteMin) {
				k.miss("-", bed + n, carrier.id)
			}
		}
	})

	// WASTE YARN INTERLOCK
	// knit wastePasses rows of the waste yarn. carrier ends
	// wastePasses should always be odd in Mode A
	k.comment(`;waste yarn section`)
	// now speed it up
	k.speedNumber(400)
	for (let p = 0; p < wastePasses; ++p) {
		// even numbered rows in +ve direction
		if (p % 2 === 0) {
			k.rollerAdvance(450)
			for (let n = wasteMin; n <= wasteMax; ++n) {
				if (n % 2 === 0) {
					k.knit("+", `f${n}`, wasteCarrier)
				} else {
					k.knit("+", `b${n}`, wasteCarrier)
				}
			}
		}

		// odd numbered rows in -ve direction
		else {
			k.rollerAdvance(0)
			for (let n = wasteMax; n >= wasteMin; --n) {
				if (n % 2 === 0) {
					k.knit("-", `b${n}`, wasteCarrier)
				} else {
					k.knit("-", `f${n}`, wasteCarrier)
				}
			}
		}
	}

	// BRING IN DRAW THREAD
	// knit 1 row of draw thread, from L to R
	for (let n = wasteMin; n <= wasteMax; ++n) {
		if (n % 2 === 0) {
			k.knit("+", `b${n}`, drawCarrier)
		} else {
			k.knit("+", `f${n}`, drawCarrier)
		}
	}

	// BRING IN EACH MAIN YARN
	// knit one or two depending on direction
	// cast on direction needs to be opposite
	// need to keep track of rows from here

	carrierSet.mainYarns.forEach(carrier => {
		let rowCount = 0
		let rows = 2 // default

		if (carrier.castOn && carrier.dir === "+") rows = 1
		if (!carrier.castOn && carrier.dir === "-") rows = 1

		// always do 1 row
		for (let i = 0; i < rows; i++) {
			if (rowCount % 2 === 0) {
				for (let n = wasteMin; n <= wasteMax; ++n) {
					if (n % 2 === 0) {
						k.knit("+", `f${n}`, carrier.id)
					} else {
						k.knit("+", `b${n}`, carrier.id)
					}
				}
			}
			// odd numbered rows in -ve direction
			else {
				for (let n = wasteMax; n >= wasteMin; --n) {
					if (n % 2 === 0) {
						k.knit("-", `b${n}`, carrier.id)
					} else {
						k.knit("-", `f${n}`, carrier.id)
					}
				}
			}

			rowCount += 1
		}
	})

	// TUBE
	// needs to drop out on LHS
	// slow it down a bit
	k.speedNumber(200)
	k.rollerAdvance(200)

	for (let p = 0; p < tubeRows; ++p) {
		if (p % 2 === 0) {
			for (let n = wasteMax; n >= wasteMin; --n) {
				k.knit("-", `b${n}`, wasteCarrier)
			}
		} else {
			for (let n = wasteMin; n <= wasteMax; ++n) {
				k.knit("+", `f${n}`, wasteCarrier)
			}
		}
	}

	k.rollerAdvance(450)
	// drop all needles on back bed
	for (let n = wasteMin; n <= wasteMax; ++n) {
		k.drop("b" + n)
	}

	//knitfold: (no console to say it's adding the draw thread)
	// draw thread -- always R-L
	k.comment(`;draw thread`)
	k.rollerAdvance(100)

	for (let n = wasteMax; n >= wasteMin; --n) {
		k.knit("-", `f${n}`, drawCarrier)
	}

	k.out(drawCarrier)

	//set back to normal
	k.rollerAdvance(450)

	const castOn = carrierSet.castOn!
	if (castOn.dir === "-") {
		k.rack(0.5)
		for (let n = wasteMin; n <= wasteMax; ++n) {
			k.knit("+", `f${n}`, castOn.id)
			k.knit("+", `b${n}`, castOn.id)
		}
	} else {
		k.rack(-0.5)
		for (let n = wasteMax; n >= wasteMin; --n) {
			k.knit("-", `f${n}`, castOn.id)
			k.knit("-", `b${n}`, castOn.id)
		}
	}

	k.rack(0)

	// back to default speed
	k.speedNumber(300)

	// do the transfers
	// transfers R->L, ending up at L
	if (castOn.dir === "+") {
		for (let n = wasteMin; n <= wasteMax; ++n) {
			k.xfer("b" + n, "f" + n)
		}
	}

	// transfers L->R, ending up at R
	else {
		for (let n = wasteMax; n >= wasteMin; --n) {
			k.xfer("b" + n, "f" + n)
		}
	}

	k.speedNumber(450)
	k.out(wasteCarrier)
}

//knitfold: not async (it awaits nothing), and its settings its own
export function addWasteSection(k: WasteWriter, carriers: string[], castOnCarrier: string, minN: number, maxN: number) {
	const rollerAdvance = defaultRollerAdvance
	const stitchNumber = defaultStitchNumber
	const wasteCarrier = defaultWasteCarrier
	const drawCarrier = defaultDrawCarrier
	void defaultSpeedNumber
	void defaultCastonStyle

	// to revisit: do the 20 stitch cast on thing
	const wasteMin = minN
	const wasteMax = maxN

	// prefix with default settings
	k.rollerAdvance(rollerAdvance)
	k.stitchNumber(stitchNumber)
	k.speedNumber(400)

	// get in carriers and caston carrier
	const carrierSet = new CarrierSet([])

	carriers.forEach(id => {
		if (!carrierSet.get(id)) {
			const castOn = id === castOnCarrier ? true : false
			const role = id === castOnCarrier ? "castOn" : null
			carrierSet.carriers.push({
				id,
				position: "L",
				role: role,
				castOn: castOn,
				isMainYarn: true,
				dir: "+",
			})
		}
	})

	// now add in drawthread and waste yarn

	// check waste carrier is not in main yarns
	// don't want waste last as subtle bug if it's the first one tucked
	if (carrierSet.carriers.some(c => c.id === wasteCarrier)) {
		//knitfold: (no window to alert in: carrier 6 is the waste yarn's, and
		// it's used for it)
		carrierSet.setRole(wasteCarrier, "waste")
		carrierSet.setMain(wasteCarrier, false)
	} else {
		carrierSet.push({
			id: wasteCarrier,
			role: "waste",
			isMainYarn: false,
			dir: "+",
		})
	}

	// check draw thread not in main yarns
	if (carrierSet.carriers.some(c => c.id === drawCarrier)) {
		//knitfold: (no window to alert in: main carriers can't be the same as
		// the draw thread's, carrier 1)
		carrierSet.setRole(drawCarrier, "draw")
	} else {
		carrierSet.push({
			id: drawCarrier,
			role: "drawThread",
			isMainYarn: false,
			dir: "+",
		})
	}

	generateWasteSection(k, carrierSet, wasteMin, wasteMax, wasteCarrier, drawCarrier)
}
