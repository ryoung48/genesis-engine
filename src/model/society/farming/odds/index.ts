import { MATH } from "@/model/shared/math/core"
import { FARMING_NEIGHBORHOOD } from "@/model/society/farming/neighborhood"
import type {
	HearthOdds,
	OddsParams,
	RankParams,
	RichnessParams,
} from "@/model/society/farming/odds/types"

const RICH_KM = 150
const HEARTH_SEASON = { edge0: 1300, edge1: 1800 }
const SEASON_RANK = { edge0: 0.5, edge1: 1 }
const TROPICAL_RANGE = { edge0: 10, edge1: 5 }
const TROPICAL_HIGHLAND_T = { edge0: 26, edge1: 22 }
const START_TROPICAL = 0.5
const NPP_EDGES = { edge0: 250, edge1: 900 }
const RELIEF_EDGES = { edge0: 0.1, edge1: 0.6 }
const HIGHLAND_T = { edge0: 4, edge1: 9 }
const RICH_EDGES = { edge0: 0.8, edge1: 2 }
const COLDEST_MONTH = { edge0: -10, edge1: -4 }
const RIVER_ACCESS = 1
const SHORE_ACCESS = 0.6

function rank({ values, mask }: RankParams): Float64Array {
	const ids: number[] = []
	for (let p = 0; p < values.length; p++) if (mask[p]) ids.push(p)
	ids.sort((a, b) => values[a] - values[b] || a - b)
	const out = new Float64Array(values.length)
	if (ids.length === 1) {
		out[ids[0]] = 1
		return out
	}
	const scale = Math.max(1, ids.length - 1)
	for (let i = 0; i < ids.length; ) {
		let j = i
		while (j + 1 < ids.length && values[ids[j + 1]] === values[ids[i]]) j++
		const mean = (i + j) / 2
		for (let k = i; k <= j; k++) out[ids[k]] = mean / scale
		i = j + 1
	}
	return out
}

function richness({
	measures,
	landGraph,
	r_xyz,
	planetRadiusKm,
}: RichnessParams): Float64Array {
	const out = new Float64Array(measures.count)
	for (let p = 0; p < measures.count; p++) {
		let weight = 0
		let sum = 0
		for (const q of FARMING_NEIGHBORHOOD.within({
			graph: landGraph,
			r_xyz,
			planetRadiusKm,
			province: p,
			radiusKm: RICH_KM,
		})) {
			weight += measures.areaKm2[q]
			sum += measures.areaKm2[q] * measures.forager[q] ** 4
		}
		out[p] = weight > 0 ? (sum / weight) ** 0.25 : measures.forager[p]
	}
	return out
}

function compute({
	measures,
	provinces,
	landGraph,
	mesh,
	planetRadiusKm,
	traversable,
}: OddsParams): HearthOdds {
	const habitable = Uint8Array.from(provinces.desolate, (d) => (d ? 0 : 1))
	const temperatureRank = rank({ values: measures.range, mask: habitable })
	const rainRank = rank({ values: measures.seas, mask: habitable })
	const rich = richness({
		measures,
		landGraph,
		r_xyz: mesh.r_xyz,
		planetRadiusKm,
	})
	const raw = new Float64Array(measures.count)
	const timed = new Float64Array(measures.count)
	const dependent = new Float64Array(measures.count)
	let best = 0
	let bestTimed = 0
	let bestDependent = 0
	for (let p = 0; p < measures.count; p++) {
		if (!traversable[p]) continue
		const tropical =
			MATH.smoothstep({ ...TROPICAL_RANGE, x: measures.range[p] }) *
			MATH.smoothstep({ ...TROPICAL_HIGHLAND_T, x: measures.T[p] })
		const meanRank = (temperatureRank[p] + rainRank[p]) / 2
		const seasF = MATH.smoothstep({
			...SEASON_RANK,
			x: (1 - tropical) * meanRank + tropical * rainRank[p],
		})
		const timingF = MATH.smoothstep({
			...SEASON_RANK,
			x:
				(1 - START_TROPICAL * tropical) * meanRank +
				START_TROPICAL * tropical * rainRank[p],
		})
		const dependenceF = MATH.smoothstep({ ...SEASON_RANK, x: meanRank })
		const hillF =
			0.5 +
			0.5 *
				MATH.smoothstep({ ...RELIEF_EDGES, x: measures.relief[p] }) *
				MATH.smoothstep({ ...HIGHLAND_T, x: measures.T[p] })
		const access = provinces.riverAccess[p]
			? RIVER_ACCESS
			: provinces.lakeAccess[p] || provinces.waterAccess[p] === 2
				? SHORE_ACCESS
				: 0
		const richF = 1 - 0.6 * MATH.smoothstep({ ...RICH_EDGES, x: rich[p] })
		const site =
			MATH.smoothstep({ ...NPP_EDGES, x: measures.npp[p] }) *
			hillF *
			(0.55 + 0.45 * access) *
			richF *
			MATH.smoothstep({ ...HEARTH_SEASON, x: measures.gdd[p] }) *
			MATH.smoothstep({ ...COLDEST_MONTH, x: measures.Tc[p] })
		raw[p] = seasF * site
		timed[p] = timingF * site
		dependent[p] = dependenceF * site
		best = Math.max(best, raw[p])
		bestTimed = Math.max(bestTimed, timed[p])
		bestDependent = Math.max(bestDependent, dependent[p])
	}
	const scale = (values: Float64Array, top: number) =>
		top > 0
			? Float64Array.from(values, (value) => (value > 0 ? value / top : 0))
			: new Float64Array(values.length)
	return {
		odds: scale(raw, best),
		timing: scale(timed, bestTimed),
		dependence: scale(dependent, bestDependent),
	}
}

export const FARMING_ODDS = { compute }
