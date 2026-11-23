import { UNITS } from "@/model/shared/units"
import type {
	FarmingHearth,
	HearthSchedule,
	HearthsParams,
	StartYearParams,
} from "@/model/society/farming/hearths/types"
import { FARMING_NEIGHBORHOOD } from "@/model/society/farming/neighborhood"

const FARMING_START_YEAR = -9700
const FOUNDER_DELAY = 100
const HEARTH_LAST_YEAR = -2050
const REGION_KM = 300
const REGION_ODDS = 0.15
const FARMABLE_SUITABILITY = 0.08
const SPACING_FACTOR = 0.6
const SPACING_AREA_SHARE = 8
const MAX_HEARTHS = 12

function startYear({ odds, settledYear }: StartYearParams): number {
	const first = FARMING_START_YEAR + FOUNDER_DELAY
	return Math.max(first + (HEARTH_LAST_YEAR - first) * (1 - odds), settledYear)
}

function schedule({
	provinces,
	landGraph,
	r_xyz,
	planetRadiusKm,
	odds,
	timing,
	dependence,
	traversable,
	suitability,
	areaKm2,
	continuousArrival,
}: HearthsParams): HearthSchedule {
	let farmableKm2 = 0
	for (let p = 0; p < provinces.count; p++)
		if (traversable[p] && suitability[p] >= FARMABLE_SUITABILITY)
			farmableKm2 += areaKm2[p]
	const spacingKm = SPACING_FACTOR * Math.sqrt(farmableKm2 / SPACING_AREA_SHARE)
	const candidates: number[] = []
	for (let p = 0; p < provinces.count; p++) {
		if (!traversable[p] || odds[p] < REGION_ODDS) continue
		const beaten = FARMING_NEIGHBORHOOD.within({
			graph: landGraph,
			r_xyz,
			planetRadiusKm,
			province: p,
			radiusKm: REGION_KM,
		}).some((q) => odds[q] > odds[p] || (odds[q] === odds[p] && q < p))
		if (!beaten) candidates.push(p)
	}
	let settledBest = 0
	let settledDependence = 0
	for (let p = 0; p < provinces.count; p++)
		if (traversable[p] && continuousArrival[p] <= FARMING_START_YEAR) {
			settledBest = Math.max(settledBest, timing[p])
			settledDependence = Math.max(settledDependence, dependence[p])
		}
	const scheduleScale = settledBest > 0 ? settledBest : 1
	const dependenceScale = settledDependence > 0 ? settledDependence : 1
	candidates.sort((a, b) => odds[b] - odds[a] || a - b)
	const hearths: FarmingHearth[] = []
	for (const p of candidates) {
		if (hearths.length >= MAX_HEARTHS) break
		const crowded = hearths.some(
			(hearth) =>
				UNITS.regionDistanceKm({
					r_xyz,
					fromRegion: provinces.seeds[p],
					toRegion: provinces.seeds[hearth.province],
					planetRadiusKm,
				}) < spacingKm,
		)
		if (crowded) continue
		hearths.push({
			province: p,
			startYear: startYear({
				odds: Math.min(1, timing[p] / scheduleScale),
				settledYear: continuousArrival[p],
			}),
			odds: odds[p],
			timing: Math.min(1, timing[p] / scheduleScale),
			dependence: Math.min(1, dependence[p] / dependenceScale),
			fired: false,
		})
	}
	return { hearths, farmableKm2 }
}

export const FARMING_HEARTHS = { schedule, startYear }
