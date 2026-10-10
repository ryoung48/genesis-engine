import { expect, it } from "vitest"
import { DISTRIBUTION_TARGETS as T } from "@/model/history/distribution/targets"

it("gives equivalent successor histograms to symmetric and same-bucket cuts", () => {
	const observed = T.histogram({ sizes: [800, 1, 20] })
	const split = T.action({ observed, remove: [800], add: [200, 600] })
	expect(T.action({ observed, remove: [800], add: [600, 200] })).toEqual(split)
	expect(T.action({ observed, remove: [800], add: [300, 500] })).toEqual(split)
	expect(T.bucket({ size: 200 })).toBe(T.bucket({ size: 600 }))
})

it("permits an improving size correction at the target country count", () => {
	const before = T.histogram({ sizes: [...new Array<number>(20).fill(1), 400] })
	const target = {
		...T.project({ capacities: [], year: 2025 }),
		targetN: 21,
		targetMean: 20,
		countryShares: [0.5, 0, 0, 0, 0, 0, 0.5],
		territoryShares: [20 / 420, 0, 0, 0, 0, 0, 400 / 420],
		distributionApplicable: true,
	}
	const after = T.action({ observed: before, remove: [400], add: [200, 200] })
	const reduction =
		T.loss({ observed: before, target }) - T.loss({ observed: after, target })
	expect(reduction).toBeCloseTo(
		10 * (2 / 22 - 1 / 21) - Math.log(22 / 21) / Math.log(1.25),
	)
	expect(T.gain({ before, after, target })).toBeGreaterThan(0)
})

it("uses measured checkpoint shares and separate whole-period caps", () => {
	expect(T.profile({ year: 2 }).shares).toEqual(
		[58, 166, 94, 45, 13, 5, 4].map((n) => n / 385),
	)
	expect(T.profile({ year: 2025 }).shares).toEqual(
		[27, 30, 24, 33, 25, 26, 27].map((n) => n / 192),
	)
	expect(
		[2, 475, 476, 1065, 1066, 1700, 1701, 1913, 1914, 1946, 1947, 2025].map(
			(year) => T.profile({ year }).ceiling,
		),
	).toEqual([
		500, 500, 809, 809, 1870, 1870, 2014, 2014, 2189, 2189, 2189, 2189,
	])
	const p = T.profile({ year: 2 })
	expect(p.shares.reduce((a, q, b) => a + q * p.means[b], 0)).toBeCloseTo(
		3745 / 385,
		4,
	)
})
it("fits endpoints, adaptive brackets and a normalized mixture fallback", () => {
	for (const mean of [101, 120]) {
		const fit = T.fitPmf({ lo: 101, hi: 120, mean, iterations: 64 })
		expect(fit.probabilities[mean - 101]).toBe(1)
	}
	const fit = T.fitPmf({ lo: 101, hi: 120, mean: 119.9, iterations: 64 })
	expect(fit.expansions).toBeGreaterThan(0)
	expect(
		Math.abs(
			fit.probabilities.reduce((a, p, i) => a + p * (i + 101), 0) - 119.9,
		),
	).toBeLessThanOrEqual(0.0001)
	const mixture = T.fitPmf({ lo: 2, hi: 4, mean: 2.6, iterations: 0 })
	expect(mixture.mixture).toBe(true)
	expect(
		mixture.probabilities.reduce((a, p, i) => a + p * (i + 2), 0),
	).toBeCloseTo(2.6, 10)
})
it("conserves component mass independently of ownership and handles empty targets", () => {
	const p = T.project({ capacities: [1, 3, 8], year: 2 })
	expect(p.components.map((c) => c.sizes.reduce((a, b) => a + b, 0))).toEqual([
		1, 3, 8,
	])
	expect(p.targetN).toBe(p.components.reduce((a, c) => a + c.sizes.length, 0))
	expect(p.countryShares.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
	const empty = T.project({ capacities: [], year: 2 })
	expect(empty.targetN).toBe(0)
	expect(empty.distributionApplicable).toBe(false)
	expect(T.loss({ observed: T.histogram({ sizes: [] }), target: empty })).toBe(
		0,
	)
})

it("projects count ties and integer mass using fixed component targets", () => {
	const profile = {
		year: 2,
		ceiling: 4,
		shares: [0, 1, 0, 0, 0, 0, 0],
		means: [1, 2, 5, 10, 25, 50, 101],
	}
	const tie = T.projectComponent({ capacity: 3, profile })
	expect(tie.sizes).toEqual([3])
	const balanced = T.projectComponent({
		capacity: 5,
		profile: { ...profile, means: [1, 3, 5, 10, 25, 50, 101] },
	})
	expect(balanced.sizes).toEqual([2, 3])
	expect(balanced.sizes.reduce((a, b) => a + b, 0)).toBe(5)
})
