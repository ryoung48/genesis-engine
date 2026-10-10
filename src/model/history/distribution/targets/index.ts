import type {
	ActionParams,
	ComponentProjection,
	DistributionProjection,
	EndpointParams,
	GainParams,
	Histogram,
	HistogramParams,
	LossParams,
	ObjectiveParams,
	PmfDiagnostic,
	PmfParams,
	PowerParams,
	ProjectComponentParams,
	ProjectionParams,
	SizeParams,
	SizePmf,
	TargetProfile,
	YearParams,
} from "@/model/history/distribution/targets/types"

const years = [2, 476, 1066, 1701, 1914, 2025]
const counts = [
	[58, 166, 94, 45, 13, 5, 4],
	[70, 161, 85, 39, 20, 9, 7],
	[141, 180, 106, 84, 23, 9, 8],
	[110, 124, 85, 64, 18, 10, 11],
	[22, 35, 14, 25, 8, 10, 25],
	[27, 30, 24, 33, 25, 26, 27],
]
const means = [
	[1, 2.741, 6.2234, 14.0222, 35.1538, 58, 317.25],
	[1, 2.795, 6.3176, 14.6923, 32.2, 63.5556, 190.5714],
	[1, 2.8111, 6.4906, 15.8214, 35.2609, 65.1111, 162.5],
	[1, 2.629, 6.3882, 14.875, 34.8333, 72.6, 447.4545],
	[1, 2.6, 6.2857, 15.44, 37.125, 68.3, 444.4],
	[1, 2.6, 6.4583, 15.6364, 36.08, 71.6923, 349.8148],
]
const lower = [1, 2, 5, 10, 25, 50, 101]
const upper = [1, 4, 9, 24, 49, 100, Infinity]
const countryWeight = 1 / 0.1
const territoryWeight = 1 / 0.15
const countWeight = 1 / Math.log1p(0.25)

function bucket({ size }: SizeParams): number {
	for (let b = 0; b < upper.length; b++) if (size <= upper[b]) return b
	throw new Error("Invalid country size")
}

function profile({ year }: YearParams): TargetProfile {
	if (!Number.isInteger(year) || year < 2 || year > 2025)
		throw new Error("Distribution year outside 2–2025")
	let i = 0
	while (i < years.length - 2 && year > years[i + 1]) i++
	const f = (year - years[i]) / (years[i + 1] - years[i])
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

function power({ lo, hi, alpha }: PowerParams): SizePmf {
	const favored = alpha >= 0 ? lo : hi
	const weights = Array.from({ length: hi - lo + 1 }, (_, i) =>
		Math.exp(-alpha * Math.log((lo + i) / favored)),
	)
	const total = weights.reduce((a, b) => a + b, 0)
	const probabilities = weights.map((w) => w / total)
	return {
		probabilities,
		mean: probabilities.reduce((a, p, i) => a + p * (lo + i), 0),
		clamped: false,
		mixture: false,
		expansions: 0,
		numericalFallback: false,
	}
}

function fitPmf({ lo, hi, mean, iterations }: PmfParams): SizePmf {
	if (
		!Number.isInteger(lo) ||
		!Number.isInteger(hi) ||
		lo < 1 ||
		hi < lo ||
		!Number.isFinite(mean)
	)
		throw new Error("Invalid PMF support")
	const target = Math.max(lo, Math.min(hi, mean))
	const point = ({ endpoint }: EndpointParams): SizePmf => ({
		probabilities: Array.from({ length: hi - lo + 1 }, (_, i) =>
			lo + i === endpoint ? 1 : 0,
		),
		mean: endpoint,
		clamped: target !== mean,
		mixture: false,
		expansions: 0,
		numericalFallback: false,
	})
	if (target === lo || target === hi) return point({ endpoint: target })
	let a = -64,
		b = 64,
		expansions = 0,
		numericalFallback = false
	let high = power({ lo, hi, alpha: a }),
		low = power({ lo, hi, alpha: b })
	while (high.mean < target) {
		expansions++
		if (!Number.isFinite(a * 2)) {
			high = point({ endpoint: hi })
			numericalFallback = true
			break
		}
		a *= 2
		high = power({ lo, hi, alpha: a })
	}
	while (low.mean > target) {
		expansions++
		if (!Number.isFinite(b * 2)) {
			low = point({ endpoint: lo })
			numericalFallback = true
			break
		}
		b *= 2
		low = power({ lo, hi, alpha: b })
	}
	for (let i = 0; i < Math.min(64, iterations); i++) {
		const mid = a / 2 + b / 2
		if (mid === a || mid === b) break
		const law = power({ lo, hi, alpha: mid })
		if (Math.abs(law.mean - target) <= 0.0001)
			return { ...law, clamped: target !== mean, expansions, numericalFallback }
		if (law.mean > target) {
			a = mid
			high = law
		} else {
			b = mid
			low = law
		}
	}
	if (high.mean === low.mean) {
		if (Math.abs(high.mean - target) > 0.0001)
			throw new Error("PMF bracket collapsed away from requested mean")
		return { ...high, clamped: target !== mean, expansions, numericalFallback }
	}
	const weight = (target - low.mean) / (high.mean - low.mean)
	return {
		probabilities: high.probabilities.map(
			(p, i) => weight * p + (1 - weight) * low.probabilities[i],
		),
		mean: target,
		clamped: target !== mean,
		mixture: true,
		expansions,
		numericalFallback,
	}
}

function objective({
	counts,
	countries,
	masses,
	count,
	capacity,
	shares,
	territoryShares,
	pmf,
}: ObjectiveParams): number {
	let value = 0
	for (let b = 0; b < 7; b++) {
		value += (countries[b] - count * shares[b]) ** 2 / (count * shares[b] + 1)
		value +=
			(masses[b] - capacity * territoryShares[b]) ** 2 /
			(capacity * territoryShares[b] + 1)
	}
	for (let s = 1; s < counts.length; s++)
		value += (counts[s] - count * pmf[s]) ** 2 / (count * pmf[s] + 1)
	return value
}

function projectComponent({
	capacity,
	profile: law,
}: ProjectComponentParams): ComponentProjection {
	if (!Number.isInteger(capacity) || capacity <= 0)
		throw new Error("Projection needs positive integer capacity")
	const ceiling = Math.min(capacity, law.ceiling)
	const shares = law.shares.map((q, b) => (lower[b] <= ceiling ? q : 0))
	const sum = shares.reduce((a, b) => a + b, 0)
	if (sum <= 0) throw new Error("No supported target weight")
	for (let b = 0; b < 7; b++) shares[b] /= sum
	const pmf = new Array<number>(ceiling + 1).fill(0)
	const conditional = new Array<number>(7).fill(0)
	const fitDiagnostics: PmfDiagnostic[] = []
	for (let b = 0; b < 7; b++) {
		if (lower[b] > ceiling) continue
		const fit = fitPmf({
			lo: lower[b],
			hi: Math.min(upper[b], ceiling),
			mean: law.means[b],
			iterations: 64,
		})
		conditional[b] = fit.mean
		fitDiagnostics.push({
			lo: lower[b],
			hi: Math.min(upper[b], ceiling),
			requestedMean: law.means[b],
			mean: fit.mean,
			clamped: fit.clamped,
			mixture: fit.mixture,
			expansions: fit.expansions,
			numericalFallback: fit.numericalFallback,
		})
		for (let i = 0; i < fit.probabilities.length; i++)
			pmf[lower[b] + i] = shares[b] * fit.probabilities[i]
	}
	const continuousMean = shares.reduce((a, q, b) => a + q * conditional[b], 0)
	const territoryShares = shares.map(
		(q, b) => (q * conditional[b]) / continuousMean,
	)
	const reference = capacity / continuousMean
	const count = Math.max(
		Math.ceil(capacity / ceiling),
		Math.min(capacity, Math.ceil(reference - 0.5)),
	)
	const sizes: number[] = [],
		frequencies = new Array<number>(ceiling + 1).fill(0),
		countries = new Array<number>(7).fill(0),
		masses = new Array<number>(7).fill(0)
	let s = 1,
		cdf = pmf[1],
		mass = 0
	for (let i = 0; i < count; i++) {
		const quantile = (i + 0.5) / count
		while (s < ceiling && cdf < quantile) cdf += pmf[++s]
		sizes.push(s)
		frequencies[s]++
		countries[bucket({ size: s })]++
		masses[bucket({ size: s })] += s
		mass += s
	}
	const args = {
		counts: frequencies,
		countries,
		masses,
		count,
		capacity,
		shares,
		territoryShares,
		pmf,
	}
	while (mass !== capacity) {
		const direction = mass < capacity ? 1 : -1
		let best = -1,
			bestValue = Infinity
		for (let old = 1; old <= ceiling; old++) {
			const next = old + direction
			if (!frequencies[old] || next < 1 || next > ceiling) continue
			const ob = bucket({ size: old }),
				nb = bucket({ size: next })
			let value = 0
			for (const bucketId of new Set([ob, nb])) {
				const dc = (bucketId === nb ? 1 : 0) - (bucketId === ob ? 1 : 0)
				const dm = (bucketId === nb ? next : 0) - (bucketId === ob ? old : 0)
				const ec = count * shares[bucketId],
					em = capacity * territoryShares[bucketId]
				value +=
					((countries[bucketId] + dc - ec) ** 2 -
						(countries[bucketId] - ec) ** 2) /
					(ec + 1)
				value +=
					((masses[bucketId] + dm - em) ** 2 - (masses[bucketId] - em) ** 2) /
					(em + 1)
			}
			value +=
				((frequencies[old] - 1 - count * pmf[old]) ** 2 -
					(frequencies[old] - count * pmf[old]) ** 2) /
				(count * pmf[old] + 1)
			value +=
				((frequencies[next] + 1 - count * pmf[next]) ** 2 -
					(frequencies[next] - count * pmf[next]) ** 2) /
				(count * pmf[next] + 1)
			if (value < bestValue) {
				bestValue = value
				best = old
			}
		}
		if (best < 0) throw new Error("Projection mass cannot be balanced")
		const ordinal = sizes.indexOf(best),
			next = best + direction,
			ob = bucket({ size: best }),
			nb = bucket({ size: next })
		sizes[ordinal] = next
		frequencies[best]--
		frequencies[next]++
		countries[ob]--
		countries[nb]++
		masses[ob] -= best
		masses[nb] += next
		mass += direction
	}
	return {
		capacity,
		ceiling,
		sizes,
		shares,
		territoryShares,
		pmf,
		continuousMean,
		objective: objective(args),
		fitDiagnostics,
	}
}

function histogram({ sizes }: HistogramParams): Histogram {
	const countries = new Array<number>(7).fill(0),
		territory = new Array<number>(7).fill(0)
	let mass = 0,
		count = 0
	for (const size of sizes) {
		if (!Number.isInteger(size) || size <= 0)
			throw new Error("Invalid live country size")
		const b = bucket({ size: size })
		countries[b]++
		territory[b] += size
		mass += size
		count++
	}
	return { count, mass, countries, territory }
}

function project({
	capacities,
	year,
}: ProjectionParams): DistributionProjection {
	const raw = profile({ year }),
		cache = new Map<number, ComponentProjection>()
	const components = capacities.map((capacity) => {
		let result = cache.get(capacity)
		if (!result) {
			result = projectComponent({ capacity, profile: raw })
			cache.set(capacity, result)
		}
		return result
	})
	const h = histogram({ sizes: components.flatMap((c) => c.sizes) })
	return {
		components,
		targetN: h.count,
		targetMean: h.count ? h.mass / h.count : 0,
		countryShares: h.countries.map((n) => (h.count ? n / h.count : 0)),
		territoryShares: h.territory.map((n) => (h.mass ? n / h.mass : 0)),
		distributionApplicable: h.mass > 0,
		raw,
	}
}

function loss({ observed: h, target: t }: LossParams): number {
	if (h.mass === 0 && t.targetN === 0) return 0
	if (h.count <= 0 || t.targetN <= 0 || h.mass <= 0)
		throw new Error("Positive territory requires countries")
	let value = countWeight * Math.abs(Math.log(h.count / t.targetN))
	for (let b = 0; b < 7; b++)
		value +=
			0.5 *
			(countryWeight * Math.abs(h.countries[b] / h.count - t.countryShares[b]) +
				territoryWeight *
					Math.abs(h.territory[b] / h.mass - t.territoryShares[b]))
	return value
}

function gain({ before, after, target }: GainParams): number {
	if (before.mass === 0 && after.mass === 0) return 0
	if (before.count <= 0 || after.count <= 0)
		throw new Error("Invalid action counts")
	let distance =
		countWeight *
		Math.abs(Math.log1p((after.count - before.count) / before.count))
	for (let b = 0; b < 7; b++)
		distance +=
			0.5 *
			(countryWeight *
				Math.abs(
					before.countries[b] / before.count - after.countries[b] / after.count,
				) +
				territoryWeight *
					Math.abs(
						before.territory[b] / before.mass - after.territory[b] / after.mass,
					))
	return distance > 0
		? Math.max(
				-1,
				Math.min(
					1,
					(loss({ observed: before, target }) -
						loss({ observed: after, target })) /
						distance,
				),
			)
		: 0
}

function action({ observed, remove, add }: ActionParams): Histogram {
	const result = {
		count: observed.count,
		mass: observed.mass,
		countries: [...observed.countries],
		territory: [...observed.territory],
	}
	for (const size of remove) {
		const b = bucket({ size: size })
		result.count--
		result.mass -= size
		result.countries[b]--
		result.territory[b] -= size
	}
	for (const size of add) {
		const b = bucket({ size: size })
		result.count++
		result.mass += size
		result.countries[b]++
		result.territory[b] += size
	}
	return result
}
export const DISTRIBUTION_TARGETS = {
	bucket,
	action,
	profile,
	fitPmf,
	projectComponent,
	project,
	histogram,
	loss,
	gain,
}
