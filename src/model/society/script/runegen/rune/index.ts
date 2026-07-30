import { RNG } from "@/model/shared/random/rng"
import {
	_buildStrokes,
	_countInkBlobs,
	_isConnected,
	_isSymmetric,
} from "@/model/society/script/runegen/rune/geometry"
import {
	_applyMotif,
	_applyTemplate,
	_resolveTemplate,
} from "@/model/society/script/runegen/rune/templates"
import type {
	DiffRunesParams,
	GenerateRuneParams,
	RuneData,
	RuneTemplate,
	TemplateSpec,
} from "@/model/society/script/runegen/rune/types"

// Classic grid dimensions; per-rune width/height come from the template's
// spec and default to these
export const WIDTH = 5
export const HEIGHT = 7

// Direction constants used while tracing strokes out of the links grid
export const DIR_S = 0 // South
export const DIR_E = 1 // East
export const DIR_N = 2 // North
export const DIR_W = 3 // West

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
