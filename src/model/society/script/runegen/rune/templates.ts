import { Point2D } from "@/model/society/script/runegen/point2d"
import { _coin, _placeDots } from "@/model/society/script/runegen/rune/geometry"
import { WIDTH } from "@/model/society/script/runegen/rune/index"
import type {
	RuneData,
	RuneMotif,
	RuneTemplate,
} from "@/model/society/script/runegen/rune/types"

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

function _selectRandomTemplate(rune: RuneData): RuneTemplate {
	return rune.rng.choice<RuneTemplate>([
		"random1",
		"random2",
		"random4",
		"random5",
		"cursive",
	])
}

export function _resolveTemplate({
	options,
	rune,
}: {
	options: {
		forceTemplate?: RuneTemplate
		seedTemplate?: RuneTemplate | "any"
	}
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

export function _applyTemplate(rune: RuneData): void {
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
export function _applyMotif({
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
