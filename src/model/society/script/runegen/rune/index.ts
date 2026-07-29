import { RNG } from "@/model/shared/random/rng"
import { Point2D } from "@/model/society/script/runegen/point2d"
import type {
	DiffRunesParams,
	GenerateRuneParams,
	RuneData,
	RuneMotif,
	RuneTemplate,
	TemplateSpec,
} from "@/model/society/script/runegen/rune/types"

// Classic grid dimensions; per-rune width/height come from the template's
// spec and default to these
const WIDTH = 5
const HEIGHT = 7

// Direction constants used while tracing strokes out of the links grid
const DIR_S = 0 // South
const DIR_E = 1 // East
const DIR_N = 2 // North
const DIR_W = 3 // West

const CLASSIC_SPEC: TemplateSpec = {
	width: 5,
	height: 7,
	minWeight: 11,
	maxWeight: 21,
}

const TEMPLATE_SPECS: Record<RuneTemplate, TemplateSpec> = {
	random1: CLASSIC_SPEC,
	random2: CLASSIC_SPEC,
	random4: CLASSIC_SPEC,
	random5: CLASSIC_SPEC,
	cursive: CLASSIC_SPEC,
}

function _coin({
	rune,
	chance = 0.5,
}: {
	rune: RuneData
	chance?: number
}): boolean {
	return rune.rng.random() < chance
}

function _countNeighbours({
	rune,
	x,
	y,
	r = 1,
}: {
	rune: RuneData
	x: number
	y: number
	r?: number
}): number {
	let n = 0

	if (x > r - 1 && rune.bitmap[y][x - r]) n++
	if (x < rune.width - r && rune.bitmap[y][x + r]) n++
	if (y > r - 1 && rune.bitmap[y - r][x]) n++
	if (y < rune.height - r && rune.bitmap[y + r][x]) n++

	return n
}

// A dot needs clear space around it and an anchor two cells away so it reads
// as a diacritic of this letter
function _canPlaceDot({
	rune,
	i,
	j,
}: {
	rune: RuneData
	i: number
	j: number
}): boolean {
	return (
		!rune.bitmap[i][j] &&
		_countNeighbours({ rune, x: j, y: i }) === 0 &&
		_countNeighbours({ rune, x: j, y: i, r: 2 }) > 0
	)
}

function _placeDots({
	rune,
	spots,
	budget,
}: {
	rune: RuneData
	spots: Point2D[]
	budget: number
}): void {
	let remaining = budget
	for (const spot of rune.rng.shuffle(spots)) {
		if (remaining <= 0) {
			break
		}
		if (_canPlaceDot({ rune, i: spot.y, j: spot.x })) {
			rune.bitmap[spot.y][spot.x] = true
			remaining--
		}
	}
}

function _random1(rune: RuneData): void {
	rune.bitmap[0][0] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[0][2] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[0][4] = _coin({ rune, chance: 4 / 5 })

	rune.bitmap[3][0] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[3][2] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[3][4] = _coin({ rune, chance: 4 / 5 })

	rune.bitmap[6][0] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[6][2] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[6][4] = _coin({ rune, chance: 2 / 5 })

	rune.bitmap[0][1] =
		rune.bitmap[0][0] && rune.bitmap[0][2] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[0][3] =
		rune.bitmap[0][2] && rune.bitmap[0][4] && _coin({ rune, chance: 3 / 4 })

	rune.bitmap[1][0] = rune.bitmap[2][0] =
		rune.bitmap[0][0] && rune.bitmap[3][0] && _coin({ rune, chance: 2 / 3 })
	rune.bitmap[1][2] = rune.bitmap[2][2] =
		rune.bitmap[0][2] && rune.bitmap[3][2] && _coin({ rune, chance: 1 / 4 })
	rune.bitmap[1][4] = rune.bitmap[2][4] =
		rune.bitmap[0][4] && rune.bitmap[3][4] && _coin({ rune, chance: 4 / 5 })

	rune.bitmap[3][1] =
		rune.bitmap[3][0] && rune.bitmap[3][2] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[3][3] =
		rune.bitmap[3][2] && rune.bitmap[3][4] && _coin({ rune, chance: 2 / 5 })

	rune.bitmap[4][0] = rune.bitmap[5][0] =
		rune.bitmap[3][0] && rune.bitmap[6][0] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[4][2] = rune.bitmap[5][2] =
		rune.bitmap[3][2] && rune.bitmap[6][2] && _coin({ rune, chance: 2 / 4 })
	rune.bitmap[4][4] = rune.bitmap[5][4] =
		rune.bitmap[3][4] && rune.bitmap[6][4] && _coin({ rune, chance: 3 / 4 })

	rune.bitmap[6][1] =
		rune.bitmap[6][0] && rune.bitmap[6][2] && _coin({ rune, chance: 4 / 5 })
	rune.bitmap[6][3] =
		rune.bitmap[6][2] && rune.bitmap[6][4] && _coin({ rune, chance: 4 / 5 })

	if (rune.bitmap[4][2] && rune.bitmap[3][1] !== rune.bitmap[3][3]) {
		rune.bitmap[5][2] = false
	}
}

function _random2(rune: RuneData): void {
	rune.bitmap[0][0] = _coin({ rune, chance: 1 / 2 })
	rune.bitmap[0][2] = _coin({ rune, chance: 1 / 2 })
	rune.bitmap[0][4] = _coin({ rune, chance: 1 / 2 })

	rune.bitmap[2][0] = _coin({ rune, chance: 3 / 4 })
	rune.bitmap[2][2] = _coin({ rune, chance: 3 / 4 })
	rune.bitmap[2][4] = _coin({ rune, chance: 3 / 4 })

	rune.bitmap[4][0] = _coin({ rune, chance: 1 / 2 })
	rune.bitmap[4][2] = _coin({ rune, chance: 1 / 2 })
	rune.bitmap[4][4] = _coin({ rune, chance: 1 / 2 })

	rune.bitmap[6][0] = _coin({ rune, chance: 1 / 2 })
	rune.bitmap[6][2] = _coin({ rune, chance: 1 / 2 })
	rune.bitmap[6][4] = _coin({ rune, chance: 1 / 2 })

	rune.bitmap[0][1] =
		rune.bitmap[0][0] && rune.bitmap[0][2] && _coin({ rune, chance: 1 / 4 })
	rune.bitmap[0][3] =
		rune.bitmap[0][2] && rune.bitmap[0][4] && _coin({ rune, chance: 1 / 4 })

	rune.bitmap[1][0] =
		rune.bitmap[0][0] && rune.bitmap[2][0] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[1][2] =
		rune.bitmap[0][2] && rune.bitmap[2][2] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[1][4] =
		rune.bitmap[0][4] && rune.bitmap[2][4] && _coin({ rune, chance: 3 / 4 })

	rune.bitmap[2][1] =
		rune.bitmap[2][0] && rune.bitmap[2][2] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[2][3] =
		rune.bitmap[2][2] && rune.bitmap[2][4] && _coin({ rune, chance: 3 / 4 })

	rune.bitmap[3][0] =
		rune.bitmap[2][0] && rune.bitmap[4][0] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[3][2] =
		rune.bitmap[2][2] && rune.bitmap[4][2] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[3][4] =
		rune.bitmap[2][4] && rune.bitmap[4][4] && _coin({ rune, chance: 3 / 4 })

	rune.bitmap[4][1] = rune.bitmap[4][2]
	rune.bitmap[4][3] = rune.bitmap[4][2]

	rune.bitmap[5][0] =
		rune.bitmap[4][0] && rune.bitmap[6][0] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[5][2] =
		rune.bitmap[4][2] && rune.bitmap[6][2] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[5][4] =
		rune.bitmap[4][4] && rune.bitmap[6][4] && _coin({ rune, chance: 3 / 4 })

	rune.bitmap[6][1] =
		rune.bitmap[6][0] && rune.bitmap[6][2] && _coin({ rune, chance: 1 / 4 })
	rune.bitmap[6][3] =
		rune.bitmap[6][2] && rune.bitmap[6][4] && _coin({ rune, chance: 1 / 4 })
}

// Enclosure template - hollow frame shapes (O, C, U, E)
function _random4(rune: RuneData): void {
	const openSide = _coin({ rune, chance: 3 / 4 })
		? rune.rng.choice(["top", "bottom", "left", "right"])
		: "none"
	const top = openSide !== "top"
	const bottom = openSide !== "bottom"
	const left = openSide !== "left"
	const right = openSide !== "right"

	if (top) {
		for (let j = 0; j < WIDTH; j++) {
			rune.bitmap[0][j] = true
		}
	}
	if (bottom) {
		for (let j = 0; j < WIDTH; j++) {
			rune.bitmap[6][j] = true
		}
	}

	// Side walls; when the top or bottom is open, one wall may recede from the
	// opening while the other keeps the glyph anchored to that edge
	const recedeLeft = _coin({ rune })
	const leftFrom = top ? 0 : recedeLeft ? rune.rng.randint(0, 2) : 0
	const rightFrom = top ? 0 : recedeLeft ? 0 : rune.rng.randint(0, 2)
	const leftTo = bottom ? 6 : recedeLeft ? rune.rng.randint(4, 6) : 6
	const rightTo = bottom ? 6 : recedeLeft ? 6 : rune.rng.randint(4, 6)
	if (left) {
		for (let i = leftFrom; i <= leftTo; i++) {
			rune.bitmap[i][0] = true
		}
	}
	if (right) {
		for (let i = rightFrom; i <= rightTo; i++) {
			rune.bitmap[i][4] = true
		}
	}

	// Inner detail keeps box letters distinguishable: a mid bar off one wall
	// (E-like), a stub hanging off a bar, or a floating center tick
	const detail = rune.rng.random()
	if (detail < 0.25 && left) {
		rune.bitmap[3][1] = true
		rune.bitmap[3][2] = _coin({ rune, chance: 1 / 2 })
	} else if (detail < 0.5 && right) {
		rune.bitmap[3][3] = true
		rune.bitmap[3][2] = _coin({ rune, chance: 1 / 2 })
	} else if (detail < 0.8) {
		if (top && _coin({ rune })) {
			rune.bitmap[1][2] = true
			rune.bitmap[2][2] = _coin({ rune, chance: 1 / 2 })
		} else if (bottom) {
			rune.bitmap[5][2] = true
			rune.bitmap[4][2] = _coin({ rune, chance: 1 / 2 })
		}
	} else if (detail < 0.9 && rune.maxDots > 0) {
		rune.bitmap[3][2] = true
	}
}

// Cursive template - letters sit on a shared connector line the way Arabic
// letters join along the rasm: teeth above, hooks below, and dots doing much
// of the distinguishing work
function _cursive(rune: RuneData): void {
	// Connector line, edge to edge, so adjacent letters visually join
	for (let j = 0; j < WIDTH; j++) {
		rune.bitmap[4][j] = true
	}

	// Occasional tall ascender (alif-like)
	let ascenderCol = -1
	if (_coin({ rune, chance: 1 / 4 })) {
		ascenderCol = rune.rng.choice([0, 1, 3, 4])
		for (let i = 0; i < 4; i++) {
			rune.bitmap[i][ascenderCol] = true
		}

		// Occasional hook at the top, bending toward the body (hamza-like)
		if (_coin({ rune, chance: 1 / 3 })) {
			const hookCol = ascenderCol < 2 ? ascenderCol + 1 : ascenderCol - 1
			rune.bitmap[0][hookCol] = true
		}
	}

	// Teeth: short bumps on the line, kept off columns beside the ascender so
	// the body stays one stroke wide
	const toothCols = [0, 2, 4].filter(
		(c) => ascenderCol === -1 || Math.abs(c - ascenderCol) >= 2,
	)
	for (const c of rune.rng.sample(toothCols, rune.rng.randint(1, 3))) {
		rune.bitmap[3][c] = true
		if (_coin({ rune, chance: 1 / 2 })) {
			rune.bitmap[2][c] = true
		}
	}

	// Descender hook below the line, occasionally curling into a tail
	if (_coin({ rune, chance: 1 / 2 })) {
		const c = rune.rng.randint(0, WIDTH - 1)
		rune.bitmap[5][c] = true
		if (_coin({ rune, chance: 1 / 2 })) {
			rune.bitmap[6][c] = true
			if (_coin({ rune, chance: 1 / 3 })) {
				const tailCol = c < 2 ? c + 1 : c > 2 ? c - 1 : rune.rng.choice([1, 3])
				rune.bitmap[6][tailCol] = true
			}
		}
	}

	// Dots (i'jam-like diacritics) above or below the body
	const spots: Point2D[] = []
	for (const j of [0, 2, 4]) {
		for (const i of [0, 1, 2, 6]) {
			spots.push(new Point2D(j, i))
		}
	}
	_placeDots({
		rune,
		spots,
		budget: Math.min(rune.maxDots, rune.rng.randint(0, 3)),
	})
}

// Vertical spine template - strong vertical center line
function _random5(rune: RuneData): void {
	// Strong center column
	rune.bitmap[0][2] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[1][2] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[2][2] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[3][2] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[4][2] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[5][2] = _coin({ rune, chance: 4 / 5 })
	rune.bitmap[6][2] = _coin({ rune, chance: 4 / 5 })

	// Branches from spine
	rune.bitmap[0][0] = rune.bitmap[0][2] && _coin({ rune, chance: 2 / 3 })
	rune.bitmap[0][4] = rune.bitmap[0][2] && _coin({ rune, chance: 2 / 3 })
	rune.bitmap[2][0] = rune.bitmap[2][2] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[2][4] = rune.bitmap[2][2] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[4][0] = rune.bitmap[4][2] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[4][4] = rune.bitmap[4][2] && _coin({ rune, chance: 3 / 4 })
	rune.bitmap[6][0] = rune.bitmap[6][2] && _coin({ rune, chance: 2 / 3 })
	rune.bitmap[6][4] = rune.bitmap[6][2] && _coin({ rune, chance: 2 / 3 })

	// Horizontal connectors
	rune.bitmap[0][1] =
		rune.bitmap[0][0] && rune.bitmap[0][2] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[0][3] =
		rune.bitmap[0][2] && rune.bitmap[0][4] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[2][1] =
		rune.bitmap[2][0] && rune.bitmap[2][2] && _coin({ rune, chance: 2 / 3 })
	rune.bitmap[2][3] =
		rune.bitmap[2][2] && rune.bitmap[2][4] && _coin({ rune, chance: 2 / 3 })
	rune.bitmap[4][1] =
		rune.bitmap[4][0] && rune.bitmap[4][2] && _coin({ rune, chance: 2 / 3 })
	rune.bitmap[4][3] =
		rune.bitmap[4][2] && rune.bitmap[4][4] && _coin({ rune, chance: 2 / 3 })
	rune.bitmap[6][1] =
		rune.bitmap[6][0] && rune.bitmap[6][2] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[6][3] =
		rune.bitmap[6][2] && rune.bitmap[6][4] && _coin({ rune, chance: 1 / 2 })

	// Vertical connectors on sides
	rune.bitmap[1][0] =
		rune.bitmap[0][0] && rune.bitmap[2][0] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[3][0] =
		rune.bitmap[2][0] && rune.bitmap[4][0] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[5][0] =
		rune.bitmap[4][0] && rune.bitmap[6][0] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[1][4] =
		rune.bitmap[0][4] && rune.bitmap[2][4] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[3][4] =
		rune.bitmap[2][4] && rune.bitmap[4][4] && _coin({ rune, chance: 1 / 2 })
	rune.bitmap[5][4] =
		rune.bitmap[4][4] && rune.bitmap[6][4] && _coin({ rune, chance: 1 / 2 })
}

function _selectRandomTemplate(rune: RuneData): RuneTemplate {
	return rune.rng.choice<RuneTemplate>([
		"random1",
		"random2",
		"random4",
		"random5",
		"cursive",
	])
}

function _resolveTemplate({
	options,
	rune,
}: {
	options: { forceTemplate?: RuneTemplate; seedTemplate?: RuneTemplate | "any" }
	rune: RuneData
}): RuneTemplate {
	if (options.forceTemplate) {
		return options.forceTemplate
	}
	if (!options.seedTemplate || options.seedTemplate === "any") {
		return _selectRandomTemplate(rune)
	}
	return options.seedTemplate
}

function _applyTemplate(rune: RuneData): void {
	switch (rune.template) {
		case "random1":
			_random1(rune)
			break
		case "random2":
			_random2(rune)
			break
		case "random4":
			_random4(rune)
			break
		case "random5":
			_random5(rune)
			break
		case "cursive":
			_cursive(rune)
			break
	}
}

// Overlay the script's shared structural feature; connectivity is safe
// because accepted glyphs already touch all four edges
function _applyMotif({
	rune,
	motif,
}: {
	rune: RuneData
	motif?: RuneMotif
}): void {
	if (!motif || motif === "none") {
		return
	}
	if (motif === "headline") {
		for (let j = 0; j < rune.width; j++) {
			rune.bitmap[0][j] = true
		}
	} else if (motif === "baseline") {
		for (let j = 0; j < rune.width; j++) {
			rune.bitmap[rune.height - 1][j] = true
		}
	} else {
		for (let i = 0; i < rune.height; i++) {
			rune.bitmap[i][0] = true
		}
	}
}

// Solid 2x2 ink blocks read as blobs rather than letterforms
function _countInkBlobs(rune: RuneData): number {
	let n = 0
	for (let i = 0; i < rune.height - 1; i++) {
		for (let j = 0; j < rune.width - 1; j++) {
			if (
				rune.bitmap[i][j] &&
				rune.bitmap[i][j + 1] &&
				rune.bitmap[i + 1][j] &&
				rune.bitmap[i + 1][j + 1]
			) {
				n++
			}
		}
	}
	return n
}

function _getWeight(rune: RuneData): number {
	let w = 0
	for (let i = 0; i < rune.height; i++) {
		for (let j = 0; j < rune.width; j++) {
			if (rune.bitmap[i][j]) {
				w++
			}
		}
	}
	return w
}

function _isConnected({
	rune,
	weight,
}: {
	rune: RuneData
	weight: number
}): boolean {
	let left = false
	let right = false
	for (let i = 0; i < rune.height; i++) {
		left = left || rune.bitmap[i][0]
		right = right || rune.bitmap[i][rune.width - 1]
	}
	if (!left || !right) {
		return false
	}

	// Cursive letters sit on the connector line, where spikes above and tails
	// below are optional and only side-to-side coverage is required
	if (rune.template !== "cursive") {
		let top = false
		let bottom = false
		for (let i = 0; i < rune.width; i++) {
			top = top || rune.bitmap[0][i]
			bottom = bottom || rune.bitmap[rune.height - 1][i]
		}
		if (!top || !bottom) {
			return false
		}
	}

	rune.dotx = -1
	rune.doty = -1
	rune.dots = []
	const isDot = (x: number, y: number): boolean =>
		rune.dots.some((p) => p.x === x && p.y === y)
	for (let i = 0; i < rune.height; i++) {
		for (let j = 0; j < rune.width; j++) {
			if (rune.bitmap[i][j] && _countNeighbours({ rune, x: j, y: i }) === 0) {
				if (_countNeighbours({ rune, x: j, y: i, r: 2 }) === 0) {
					return false
				}
				if (rune.dots.length >= rune.maxDots) {
					return false
				}
				if (rune.dotx === -1) {
					rune.dotx = j
					rune.doty = i
				}
				rune.dots.push(new Point2D(j, i))
			}
		}
	}

	let x = 0
	let y = 0
	let foundStart = false
	for (let i = 0; i < rune.height; i++) {
		for (let j = 0; j < rune.width; j++) {
			if (rune.bitmap[i][j] && !isDot(j, i)) {
				x = j
				y = i
				foundStart = true
				break
			}
		}
		if (foundStart) {
			break
		}
	}
	if (!foundStart) {
		return false
	}

	if (rune.allowDiscontinuousStrokes) {
		// When multi-stroke runes are allowed we only need a non-dot anchor;
		// bounding-box and dot limits are already validated above.
		return true
	}

	const checked: number[] = []
	const fill = (fx: number, fy: number): number => {
		const index = fx + fy * rune.width
		if (
			!rune.bitmap[fy][fx] ||
			isDot(fx, fy) ||
			checked.indexOf(index) !== -1
		) {
			return 0
		}

		checked.push(index)

		let a = 1
		if (fx > 0) {
			a += fill(fx - 1, fy)
		}
		if (fx < rune.width - 1) {
			a += fill(fx + 1, fy)
		}
		if (fy > 0) {
			a += fill(fx, fy - 1)
		}
		if (fy < rune.height - 1) {
			a += fill(fx, fy + 1)
		}

		return a
	}

	const a = fill(x, y)

	return a === weight - rune.dots.length
}

function _isSymmetric(rune: RuneData): boolean {
	rune.hSym = true
	for (const row of rune.bitmap) {
		for (let j = 0; j < rune.width >> 1; j++) {
			if (row[j] !== row[rune.width - 1 - j]) {
				rune.hSym = false
				break
			}
		}
		if (!rune.hSym) {
			break
		}
	}

	rune.vSym = true
	for (let i = 0; i < rune.height >> 1; i++) {
		for (let j = 0; j < rune.width; j++) {
			if (rune.bitmap[i][j] !== rune.bitmap[rune.height - 1 - i][j]) {
				rune.vSym = false
				break
			}
		}
		if (!rune.vSym) {
			break
		}
	}

	return rune.hSym || rune.vSym
}

function _buildStrokes(rune: RuneData): void {
	rune.strokes = []

	// Create links grid to track connections between pixels
	const links: number[][] = Array.from({ length: rune.height }, () =>
		Array.from({ length: rune.width }, () => 0),
	)

	const count = (i: number, j: number): number => {
		const l = links[i][j]
		let c = 0
		c += l & 1
		c += (l >> 1) & 1
		c += (l >> 2) & 1
		c += (l >> 3) & 1
		return c
	}

	const isEmpty = (): boolean => {
		for (let i = 0; i < rune.height; i++) {
			for (let j = 0; j < rune.width; j++) {
				if (links[i][j] !== 0) return false
			}
		}
		return true
	}

	const pickDir = (i: number, j: number, c: number): number => {
		if (c === 1) {
			if ((links[i][j] & 1) !== 0) return DIR_S
			if ((links[i][j] & 2) !== 0) return DIR_E
			if ((links[i][j] & 4) !== 0) return DIR_N
			if ((links[i][j] & 8) !== 0) return DIR_W
		} else if (c === 3) {
			if ((links[i][j] & 1) === 0) return (DIR_N + 2) % 4
			if ((links[i][j] & 2) === 0) return (DIR_E + 2) % 4
			if ((links[i][j] & 4) === 0) return (DIR_S + 2) % 4
			if ((links[i][j] & 8) === 0) return (DIR_W + 2) % 4
		} else {
			const options: number[] = []
			if ((links[i][j] & 1) !== 0) options.push(DIR_S)
			if ((links[i][j] & 2) !== 0) options.push(DIR_E)
			if ((links[i][j] & 4) !== 0) options.push(DIR_N)
			if ((links[i][j] & 8) !== 0) options.push(DIR_W)
			if (options.length > 0) {
				return options[Math.floor(rune.rng.random() * options.length)]
			}
		}
		return -1
	}

	const setLink = (i: number, j: number, d: number): void => {
		links[i][j] |= 1 << d
		let ni = i
		let nj = j
		switch (d) {
			case DIR_S:
				ni++
				break
			case DIR_E:
				nj++
				break
			case DIR_N:
				ni--
				break
			case DIR_W:
				nj--
				break
		}
		if (ni >= 0 && ni < rune.height && nj >= 0 && nj < rune.width) {
			links[ni][nj] |= 1 << ((d + 2) % 4)
		}
	}

	const clearLink = (i: number, j: number, d: number): void => {
		links[i][j] &= ~(1 << d)
		let ni = i
		let nj = j
		switch (d) {
			case DIR_S:
				ni++
				break
			case DIR_E:
				nj++
				break
			case DIR_N:
				ni--
				break
			case DIR_W:
				nj--
				break
		}
		if (ni >= 0 && ni < rune.height && nj >= 0 && nj < rune.width) {
			links[ni][nj] &= ~(1 << ((d + 2) % 4))
		}
	}

	// Build the links grid from the bitmap
	for (let i = 0; i < rune.height; i++) {
		for (let j = 0; j < rune.width; j++) {
			if (rune.bitmap[i][j]) {
				// South link
				if (i < rune.height - 1 && rune.bitmap[i + 1][j]) {
					setLink(i, j, DIR_S)
				}
				// East link
				if (j < rune.width - 1 && rune.bitmap[i][j + 1]) {
					setLink(i, j, DIR_E)
				}
			}
		}
	}

	// Priority: prefer nodes with 1 or 3 links over 4, 2, or 0
	const priority = [1, 3, 4, 2, 0]

	// Extract strokes from the links grid
	let outerIterations = 0
	const maxOuterIterations = rune.width * rune.height

	while (!isEmpty() && outerIterations < maxOuterIterations) {
		outerIterations++

		let ii = -1
		let jj = -1
		let c = 0

		// Find the best starting point
		for (let i = 0; i < rune.height; i++) {
			for (let j = 0; j < rune.width; j++) {
				if (links[i][j] !== 0) {
					const count1 = count(i, j)
					if (priority.indexOf(count1) < priority.indexOf(c)) {
						ii = i
						jj = j
						c = count1
					}
				}
			}
		}

		// Safety check - if we can't find a valid starting point, clear any remaining links
		if (ii === -1 || jj === -1) {
			break
		}

		let dir = pickDir(ii, jj, c)
		if (dir === -1) {
			// Can't pick a direction, so just clear this cell and continue
			links[ii][jj] = 0
			continue
		}

		const stroke: Point2D[] = [new Point2D(jj, ii)]
		let newDir = true
		let iterations = 0
		const maxIterations = rune.width * rune.height * 2

		// Trace the stroke
		while (iterations < maxIterations) {
			iterations++
			clearLink(ii, jj, dir)

			switch (dir) {
				case DIR_S:
					ii++
					break
				case DIR_E:
					jj++
					break
				case DIR_N:
					ii--
					break
				case DIR_W:
					jj--
					break
			}

			// Check bounds
			if (ii < 0 || ii >= rune.height || jj < 0 || jj >= rune.width) {
				break
			}

			if (!newDir) {
				stroke.pop()
			}

			stroke.push(new Point2D(jj, ii))

			if ((links[ii][jj] & (1 << dir)) === 0) {
				if (count(ii, jj) === 1) {
					const nextDir = pickDir(ii, jj, 1)
					if (nextDir !== -1) {
						dir = nextDir
						newDir = true
						continue
					}
				}
				break
			} else {
				newDir = false
			}
		}

		// Close the stroke if it forms a loop
		if (c === 2) {
			stroke.pop()
			stroke.push(stroke[0])
		}

		rune.strokes.push(stroke)
	}
}

function generate({ options = {}, rng, seed }: GenerateRuneParams): RuneData {
	const seedStr = seed ?? Date.now().toString(36)
	const rune: RuneData = {
		bitmap: [],
		strokes: [],
		width: WIDTH,
		height: HEIGHT,
		dotx: -1,
		doty: -1,
		dots: [],
		hSym: false,
		vSym: false,
		template: undefined,
		maxDots: 0,
		allowDiscontinuousStrokes: Boolean(options.allowDiscontinuousStrokes),
		rng: rng ?? RNG.createStringRng({ seed: seedStr }),
		seed: seedStr,
	}

	let attempts = 0
	const maxAttempts = 250

	// Each iteration resets strokes, so any `continue` re-enters the loop
	do {
		attempts++
		const enforceAesthetics = attempts <= maxAttempts
		const enforceSymmetry = attempts <= maxAttempts * 2

		// The template can change per attempt when seeded with 'any', and grid
		// size and weight budgets follow it
		rune.template = _resolveTemplate({ options, rune })
		const spec = TEMPLATE_SPECS[rune.template]
		rune.width = spec.width
		rune.height = spec.height
		rune.maxDots = Math.max(0, options.maxDots ?? 1)

		// Named weight bands are defined against the classic 5x7 grid; scale by
		// area so light/medium/heavy keep their meaning on bigger grids
		const areaScale = (spec.width * spec.height) / (WIDTH * HEIGHT)
		let minWeight = spec.minWeight
		let maxWeight = spec.maxWeight
		if (options.weightBand === "light") {
			minWeight = Math.round(8 * areaScale)
			maxWeight = Math.round(14 * areaScale)
		} else if (options.weightBand === "medium") {
			minWeight = Math.round(15 * areaScale)
			maxWeight = Math.round(19 * areaScale)
		} else if (options.weightBand === "heavy") {
			minWeight = Math.round(20 * areaScale)
			maxWeight = Math.round(24 * areaScale)
		}

		// A motif contributes a fixed bar of ink (minus expected overlap with
		// the template), so shift the band to keep measuring the letter itself
		const motif = options.motif
		const motifAllowance =
			motif === "headline" || motif === "baseline"
				? 4
				: motif === "stave"
					? 5
					: 0
		minWeight += motifAllowance
		maxWeight += motifAllowance

		// Progressive relaxation: first drop weight band and aesthetics, then
		// symmetry bias, so impossible option combinations can't hang generation
		if (attempts > maxAttempts) {
			minWeight = spec.minWeight
			maxWeight = spec.maxWeight + motifAllowance
		}

		rune.strokes = []
		rune.bitmap = Array.from({ length: rune.height }, () =>
			Array.from({ length: rune.width }, () => false),
		)

		_applyTemplate(rune)
		_applyMotif({ rune, motif })

		const w = _getWeight(rune)
		if (w < minWeight || w > maxWeight) {
			continue
		}

		if (enforceSymmetry) {
			if (options.symmetryBias === "symmetric" && !_isSymmetric(rune)) {
				continue
			} else if (options.symmetryBias === "asymmetric" && _isSymmetric(rune)) {
				continue
			}
		}

		if (!_isConnected({ rune, weight: w })) {
			continue
		}

		if (enforceAesthetics && _countInkBlobs(rune) > 0) {
			continue
		}

		_buildStrokes(rune)
	} while (rune.strokes.length === 0)

	return rune
}

function diff({ a, b }: DiffRunesParams): number {
	// Different grids can't be compared cell-wise; report maximal distance
	if (a.width !== b.width || a.height !== b.height) {
		return Math.max(a.width * a.height, b.width * b.height)
	}

	let r = 0

	for (let i = 0; i < a.height; i++) {
		const row1 = a.bitmap[i]
		const row2 = b.bitmap[i]
		for (let j = 0; j < a.width; j++) {
			if (row1[j] !== row2[j]) {
				r++
			}
		}
	}

	return r
}

// Grid and generation traits shared verbatim by mirrored/rotated clones; the
// clone starts with a fresh rng derived from the same seed since its bitmap
// no longer matches the sequence of draws that produced the source
function _cloneTransformed(source: RuneData, bitmap: boolean[][]): RuneData {
	return {
		bitmap,
		strokes: [],
		width: source.width,
		height: source.height,
		dotx: -1,
		doty: -1,
		dots: [],
		hSym: false,
		vSym: false,
		template: source.template,
		maxDots: source.maxDots,
		allowDiscontinuousStrokes: source.allowDiscontinuousStrokes,
		rng: RNG.createStringRng({ seed: source.seed }),
		seed: source.seed,
	}
}

function mirrorX(rune: RuneData): RuneData {
	const bitmap = Array.from({ length: rune.height }, (_, i) =>
		Array.from(
			{ length: rune.width },
			(_, j) => rune.bitmap[i][rune.width - j - 1],
		),
	)
	return _cloneTransformed(rune, bitmap)
}

function mirrorY(rune: RuneData): RuneData {
	const bitmap = Array.from({ length: rune.height }, (_, i) =>
		Array.from(
			{ length: rune.width },
			(_, j) => rune.bitmap[rune.height - i - 1][j],
		),
	)
	return _cloneTransformed(rune, bitmap)
}

function rotate180(rune: RuneData): RuneData {
	const bitmap = Array.from({ length: rune.height }, (_, i) =>
		Array.from(
			{ length: rune.width },
			(_, j) => rune.bitmap[rune.height - i - 1][rune.width - j - 1],
		),
	)
	return _cloneTransformed(rune, bitmap)
}

export const RUNE = {
	WIDTH,
	HEIGHT,
	generate,
	diff,
	mirrorX,
	mirrorY,
	rotate180,
}
