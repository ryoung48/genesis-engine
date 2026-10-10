import { DISTRIBUTION_PROJECTION } from "@/model/history/distribution/targets/projection"
import type {
	ComponentProjection,
	DistributionProjection,
	TargetProfile,
} from "@/model/history/distribution/targets/projection/types"
import type {
	HeldCapacitiesParams,
	LandStatus,
	ProjectionParams,
	SegmentParams,
	YearParams,
} from "@/model/history/distribution/targets/types"

const years = [-3000, -2000, -1000, -500, 2, 476, 1066, 1701, 1914, 2025]
const counts = [
	[55, 35, 10, 0, 0, 0, 0],
	[45, 38, 13, 4, 0, 0, 0],
	[35, 40, 15.8, 7, 2, 0.2, 0],
	[28, 42, 18, 8, 3, 0.9, 0.1],
	[58, 166, 94, 45, 13, 5, 4],
	[70, 161, 85, 39, 20, 9, 7],
	[141, 180, 106, 84, 23, 9, 8],
	[110, 124, 85, 64, 18, 10, 11],
	[22, 35, 14, 25, 8, 10, 25],
	[27, 30, 24, 33, 25, 26, 27],
]
const adTwoMeans = [1, 2.741, 6.2234, 14.0222, 35.1538, 58, 317.25]
const means = [
	adTwoMeans,
	adTwoMeans,
	adTwoMeans,
	adTwoMeans,
	[1, 2.741, 6.2234, 14.0222, 35.1538, 58, 317.25],
	[1, 2.795, 6.3176, 14.6923, 32.2, 63.5556, 190.5714],
	[1, 2.8111, 6.4906, 15.8214, 35.2609, 65.1111, 162.5],
	[1, 2.629, 6.3882, 14.875, 34.8333, 72.6, 447.4545],
	[1, 2.6, 6.2857, 15.44, 37.125, 68.3, 444.4],
	[1, 2.6, 6.4583, 15.6364, 36.08, 71.6923, 349.8148],
]
const statusYears = [
	-9999, -8000, -6000, -4000, -3300, -3000, -2000, -1000, -500, 2, 476, 1066,
	1500, 1701, 1914, 2025,
]
const stateHeldPercent = [
	0, 0, 0, 0, 0, 2, 8, 20, 33, 45, 50, 60, 71, 79, 95, 100,
]
const START_YEAR = -79999
const FIRST_STATE_YEAR = -3300

function stepYears({ year }: YearParams): number {
	return year < -9999 ? 500 : year < FIRST_STATE_YEAR ? 100 : 1
}

function nextYear({ year }: YearParams): number {
	return Math.min(
		year + stepYears({ year }),
		year < -9999
			? -9999
			: year < FIRST_STATE_YEAR
				? FIRST_STATE_YEAR
				: year + 1,
	)
}

function segment({ axis, year }: SegmentParams): { i: number; f: number } {
	let i = 0
	while (i < axis.length - 2 && year > axis[i + 1]) i++
	return {
		i,
		f: Math.max(0, (year - axis[i]) / (axis[i + 1] - axis[i])),
	}
}

function status({ year }: YearParams): LandStatus {
	if (!Number.isInteger(year) || year < START_YEAR || year > 2025)
		throw new Error("Distribution year outside 80000 BCE–2025")
	const { i, f } = segment({ axis: statusYears, year })
	const mix = (values: number[]) =>
		((1 - f) * values[i] + f * values[i + 1]) / 100
	return { stateHeld: mix(stateHeldPercent) }
}

function heldCapacities({
	capacities,
	habitableCount,
	year,
}: HeldCapacitiesParams): number[] {
	const requested = Math.round(status({ year }).stateHeld * habitableCount)
	const total = capacities.reduce((sum, value) => sum + value, 0),
		feasible = Math.min(requested, total)
	if (!total) return capacities.map(() => 0)
	const allocations = capacities.map((capacity) =>
		Math.floor((feasible * capacity) / total),
	)
	const rank = capacities
		.map((capacity, id) => ({
			id,
			remainder: (feasible * capacity) / total - allocations[id],
		}))
		.sort((a, b) => b.remainder - a.remainder || a.id - b.id)
	let remaining = feasible - allocations.reduce((sum, value) => sum + value, 0)
	for (const { id } of rank)
		if (remaining > 0 && allocations[id] < capacities[id]) {
			allocations[id]++
			remaining--
		}
	return allocations
}

function profile({ year }: YearParams): TargetProfile {
	if (!Number.isInteger(year) || year < START_YEAR || year > 2025)
		throw new Error("Distribution year outside 80000 BCE–2025")
	const { i, f } = segment({ axis: years, year })
	const totalA = counts[i].reduce((a, b) => a + b, 0)
	const totalB = counts[i + 1].reduce((a, b) => a + b, 0)
	return {
		year,
		ceiling:
			year < 476
				? 500
				: year < 1066
					? 809
					: year < 1701
						? 1870
						: year < 1914
							? 2014
							: 2189,
		shares: counts[i].map(
			(n, b) => ((1 - f) * n) / totalA + (f * counts[i + 1][b]) / totalB,
		),
		means: means[i].map((m, b) => (1 - f) * m + f * means[i + 1][b]),
	}
}

function project({
	capacities,
	year,
}: ProjectionParams): DistributionProjection {
	const raw = profile({ year }),
		cache = new Map<number, ComponentProjection>()
	const componentIds = capacities.flatMap((capacity, id) =>
		capacity > 0 ? [id] : [],
	)
	const components = componentIds.map((id) => {
		const capacity = capacities[id]
		let result = cache.get(capacity)
		if (!result) {
			result = DISTRIBUTION_PROJECTION.projectComponent({
				capacity,
				profile: raw,
			})
			cache.set(capacity, result)
		}
		return result
	})
	const h = DISTRIBUTION_PROJECTION.histogram({
		sizes: components.flatMap((c) => c.sizes),
	})
	return {
		components,
		componentIds,
		targetN: h.count,
		targetMean: h.count ? h.mass / h.count : 0,
		countryShares: h.countries.map((n) => (h.count ? n / h.count : 0)),
		territoryShares: h.territory.map((n) => (h.mass ? n / h.mass : 0)),
		distributionApplicable: h.mass > 0,
		raw,
	}
}

export const DISTRIBUTION_TARGETS = {
	startYear: START_YEAR,
	firstStateYear: FIRST_STATE_YEAR,
	stepYears,
	nextYear,
	status,
	heldCapacities,
	profile,
	project,
}
