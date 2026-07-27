import type { HydrosphereProfile } from "@/model/celestial/orbit-body/types"
import type {
	BuildHydrosphereInput,
	CountBodiesInput,
	DistributeSurfaceInput,
	WaterPctInput,
} from "@/model/celestial/planet/environment/classification/hydrosphere/types"
import type { ClampInput } from "@/model/celestial/planet/environment/classification/types"
import { DICE } from "@/model/shared/random/dice"

function clamp({ value, min, max }: ClampInput): number {
	return Math.max(min, Math.min(max, value))
}
const WATER_BANDS: [number, number][] = [
	[0, 5],
	[5, 15],
	[15, 25],
	[25, 35],
	[35, 45],
	[45, 55],
	[55, 65],
	[65, 75],
	[75, 85],
	[85, 95],
	[95, 100],
]

const MAJOR_BANDS: [number, number][] = [
	[0, 0],
	[0.05, 0.1],
	[0.1, 0.2],
	[0.2, 0.3],
	[0.3, 0.4],
	[0.4, 0.6],
	[0.6, 0.7],
	[0.7, 0.8],
	[0.8, 0.9],
	[0.9, 0.95],
	[0.95, 1],
]

function waterPct({ rng, hydrosphereCode }: WaterPctInput) {
	const [lo, hi] =
		WATER_BANDS[clamp({ value: hydrosphereCode, min: 0, max: 10 })]!
	return rng.uniform(lo, hi)
}

/** Inverse of waterPct/WATER_BANDS -- the hydrosphereCode whose band contains
 * a given water percentage (0-100). Used to keep a main world's stored
 * hydrosphereCode (and its HYDROSPHERE_DESCRIPTIONS text) in sync whenever
 * the player hand-edits land coverage directly, rather than rolling it.
 * Never returns 11-13 (superdense/molten/gas-giant-core) -- those are
 * special-roll-only codes with no equivalent water-percentage band, not
 * reachable by editing an ordinary terrestrial world's land coverage. */
function hydrosphereCodeFromWaterPct(waterPct: number): number {
	const clamped = Math.max(0, Math.min(100, waterPct))
	const index = WATER_BANDS.findIndex(
		([lo, hi]) => clamped >= lo && clamped <= hi,
	)
	return index === -1 ? 10 : index
}

function countBodies({ rng, budget, min, max }: CountBodiesInput): number {
	let count = 0
	let remaining = budget
	while (remaining > min) {
		const size = rng.uniform(min, max)
		if (size > remaining) break
		remaining -= size
		count += 1
	}
	return count
}

function distributeSurface({
	rng,
	targetPct,
	code,
}: DistributeSurfaceInput): HydrosphereProfile["surface"]["land"] {
	const empty = {
		major: { pct: 0, count: 0 },
		minor: { pct: 0, count: 0 },
		small: { pct: 0 },
	}
	if (targetPct <= 0) return empty
	const [majLo, majHi] = MAJOR_BANDS[clamp({ value: code, min: 0, max: 10 })]!
	const majorShare = rng.uniform(majLo, majHi)
	const smallShareOfRest =
		rng.uniform(0.05, 0.5) * Math.max(0.1, 1 - majorShare)
	const minorShare = (1 - majorShare) * (1 - smallShareOfRest)
	const smallShare = (1 - majorShare) * smallShareOfRest

	let majorPct = majorShare * targetPct
	let minorPct = minorShare * targetPct
	const smallPct = smallShare * targetPct

	if (majorPct < 5) {
		minorPct += majorPct
		majorPct = 0
	}

	const majorCount =
		majorPct >= 5
			? code >= 9
				? 1
				: countBodies({ rng, budget: majorPct, min: 5, max: 15 })
			: 0
	if (majorCount === 0 && majorPct > 0) {
		minorPct += majorPct
		majorPct = 0
	}
	const minorCount = countBodies({ rng, budget: minorPct, min: 1, max: 5 })
	let smallFinal = smallPct
	if (minorCount === 0 && minorPct > 0) {
		smallFinal += minorPct
		minorPct = 0
	}

	return {
		major: { pct: majorPct, count: majorCount },
		minor: { pct: minorPct, count: minorCount },
		small: { pct: smallFinal },
	}
}

function buildHydrosphereProfile({
	rng,
	code,
}: BuildHydrosphereInput): HydrosphereProfile {
	const distribution = DICE.roll2d6(rng) - 2
	const water = waterPct({ rng, hydrosphereCode: code })
	const land = 100 - water
	return {
		code,
		distribution,
		surface: {
			land: distributeSurface({ rng, targetPct: land, code: distribution }),
			water: distributeSurface({ rng, targetPct: water, code: distribution }),
		},
	}
}

function hydrosphereWaterFraction(hydrosphere: HydrosphereProfile): number {
	const { major, minor, small } = hydrosphere.surface.water
	return (major.pct + minor.pct + small.pct) / 100
}

export const HYDROSPHERE = {
	codeFromWaterPct: hydrosphereCodeFromWaterPct,
	buildProfile: buildHydrosphereProfile,
	waterFraction: hydrosphereWaterFraction,
}
