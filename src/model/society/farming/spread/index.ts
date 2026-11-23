import { MATH } from "@/model/shared/math/core"
import { PriorityHeap } from "@/model/shared/min-heap"
import { UNITS } from "@/model/shared/units"
import { FARMING_LIVING } from "@/model/society/farming/living"
import type {
	LandSpeedParams,
	Quantiles,
	SpreadEntry,
	SpreadParams,
	SpreadResult,
} from "@/model/society/farming/spread/types"
import { MIGRATION } from "@/model/society/migration"

const BASE_SPEED = 0.35
const FIT_FLOOR = 0.03
const FIT_SPEED = { edge0: 0.08, edge1: 0.45 }
const LIKE_T = 6
const LIKE_W = 1.6
const LIKE_FLOOR = 0.05
const RICH_SLOW = { edge0: 0.25, edge1: 1.4 }
const RIVER_CHANNEL = 4
const COAST_CHANNEL = 3
const HERD_SPEED = 3
// Herds loose on land with no native stock moved about as fast as the horse
// did across the Plains: from the Southwest around 1680 to the northern
// Plains by the 1740s, about 2,000 km in 60 to 70 years, or 30 km/yr (Haines
// 1938, American Anthropologist 40:112; Roe 1955, The Indian and the Horse).
const COLONIAL_SPEED = 30
const HERD_PASTURE = { edge0: 0.3, edge1: 0.8 }

function likeness({
	measures,
	source,
	destination,
}: Pick<LandSpeedParams, "measures" | "source" | "destination">): number {
	const dT = measures.T[destination] - measures.T[source]
	const p = measures.P[destination]
	const p0 = measures.P[source]
	const rain =
		p <= 0 && p0 <= 0
			? 0
			: p <= 0 || p0 <= 0
				? Infinity
				: Math.log(p / p0) / LIKE_W
	return (
		LIKE_FLOOR + (1 - LIKE_FLOOR) * Math.exp(-((dT / LIKE_T) ** 2) - rain ** 2)
	)
}

function landSpeed({
	measures,
	suitability,
	provinces,
	postMode,
	colonial,
	source,
	destination,
}: LandSpeedParams): number {
	const rich = Math.sqrt(
		1 -
			0.8 * MATH.smoothstep({ ...RICH_SLOW, x: measures.forager[destination] }),
	)
	if (FARMING_LIVING.modeOfCode({ code: postMode[destination] }) === "herd") {
		if (colonial?.[destination]) return COLONIAL_SPEED
		const herdFit =
			FIT_FLOOR +
			(1 - FIT_FLOOR) *
				MATH.smoothstep({ ...HERD_PASTURE, x: measures.pasture[destination] })
		return HERD_SPEED * herdFit * rich
	}
	const fit =
		FIT_FLOOR +
		(1 - FIT_FLOOR) *
			MATH.smoothstep({ ...FIT_SPEED, x: suitability[destination] })
	const channel = provinces.riverAccess[destination]
		? RIVER_CHANNEL
		: provinces.waterAccess[destination] === 2
			? COAST_CHANNEL
			: 1
	return (
		BASE_SPEED *
		fit *
		likeness({ measures, source, destination }) *
		rich *
		channel
	)
}

function quantiles(values: number[]): Quantiles {
	if (!values.length) return { samples: 0, p10: null, p50: null, p90: null }
	const sorted = values.toSorted((a, b) => a - b)
	const at = (fraction: number) =>
		sorted[Math.floor((sorted.length - 1) * fraction)]
	return { samples: sorted.length, p10: at(0.1), p50: at(0.5), p90: at(0.9) }
}

function search({
	provinces,
	migration,
	measures,
	r_xyz,
	planetRadiusKm,
	hearths,
	postMode,
	traversable,
	horizonYear,
	voyageYear,
	colonial,
}: SpreadParams): SpreadResult {
	const { result, landGraph, seaLinks } = migration
	const count = provinces.count
	const label = new Float64Array(count).fill(Infinity)
	const hearthOf = new Int32Array(count).fill(-1)
	const farmingFrom = new Int32Array(count).fill(-1)
	const speed = new Float64Array(count).fill(Number.NaN)
	const fired = new Set<number>()
	const landmassKm2 = new Float64Array(Math.max(0, ...provinces.landmassId) + 1)
	for (let p = 0; p < count; p++)
		if (traversable[p])
			landmassKm2[provinces.landmassId[p]] += result.areaKm2[p]
	const distance = (a: number, b: number) =>
		UNITS.regionDistanceKm({
			r_xyz,
			fromRegion: provinces.seeds[a],
			toRegion: provinces.seeds[b],
			planetRadiusKm,
		})
	const heap = new PriorityHeap<SpreadEntry>()
	for (const hearth of hearths)
		heap.push(hearth.startYear, {
			province: hearth.province,
			hearth: hearth.province,
			seed: true,
			key: hearth.startYear,
		})
	const reach = (
		q: number,
		arrival: number,
		from: number,
		edgeSpeed: number,
	) => {
		const settled = Math.max(arrival, result.continuousArrival[q])
		if (settled > horizonYear || settled >= label[q]) return
		label[q] = settled
		hearthOf[q] = hearthOf[from]
		farmingFrom[q] = from
		speed[q] = edgeSpeed
		heap.push(settled, {
			province: q,
			hearth: hearthOf[from],
			seed: false,
			key: settled,
		})
	}
	const expand = (source: number) => {
		const time = label[source]
		for (
			let j = landGraph.adjOffset[source];
			j < landGraph.adjOffset[source + 1];
			j++
		) {
			const q = landGraph.adjList[j]
			if (!traversable[q]) continue
			const km = distance(source, q)
			const v = landSpeed({
				measures,
				suitability: result.suitability,
				provinces,
				postMode,
				colonial,
				source,
				destination: q,
			})
			reach(q, time + km / v, source, km > 0 ? v : Number.NaN)
		}
		for (const link of seaLinks[source]) {
			const q = link.a === source ? link.b : link.a
			if (!traversable[q]) continue
			reach(
				q,
				voyageYear
					? voyageYear({
							distanceKm: link.distanceKm,
							source,
							sourceArrival: time,
						})
					: MIGRATION.transit({
							sourceArrival: time,
							sourceOriginKm: 0,
							distanceKm: link.distanceKm,
							meanSuitability:
								(result.suitability[source] + result.suitability[q]) / 2,
							destinationLandmassKm2: landmassKm2[provinces.landmassId[q]],
							corridorBonus: 1,
							kind: "sea",
						}),
				source,
				Number.NaN,
			)
		}
	}
	while (heap.size) {
		const first = heap.pop()!
		const batch: SpreadEntry[] = [first.value]
		while (heap.size) {
			const next = heap.pop()!
			if (next.key !== first.key) {
				heap.push(next.key, next.value)
				break
			}
			batch.push(next.value)
		}
		batch.sort((a, b) => a.province - b.province || a.hearth - b.hearth)
		for (const entry of batch) {
			const p = entry.province
			if (entry.seed) {
				if (label[p] <= entry.key) continue
				label[p] = entry.key
				hearthOf[p] = entry.hearth
				farmingFrom[p] = -1
				speed[p] = Number.NaN
				fired.add(p)
			} else if (entry.key !== label[p] || entry.hearth !== hearthOf[p])
				continue
			expand(p)
		}
	}
	const samples: number[] = []
	for (let p = 0; p < count; p++)
		if (Number.isFinite(speed[p]) && farmingFrom[p] >= 0) samples.push(speed[p])
	return {
		farmingYear: Int32Array.from(label, (year) =>
			Number.isFinite(year) ? Math.ceil(year) : MIGRATION.sentinel,
		),
		hearthOf,
		farmingFrom,
		fired: hearths.map((hearth) => fired.has(hearth.province)),
		landEdgeSpeed: quantiles(samples),
	}
}

export const FARMING_SPREAD = { search }
