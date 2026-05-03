import { describe, expect, it } from "vitest"
import {
	createRng,
	createStringRng,
	makeRandInt,
	makeRng,
	seedStringToNumber,
} from "./rng"

describe("makeRng", () => {
	it("producesSameSequenceForSameSeed", () => {
		const a = makeRng(42)
		const b = makeRng(42)
		const seqA = [a(), a(), a(), a()]
		const seqB = [b(), b(), b(), b()]
		expect(seqA).toEqual(seqB)
	})

	it("producesDifferentSequencesForDifferentSeeds", () => {
		const a = makeRng(1)
		const b = makeRng(2)
		expect(a()).not.toBe(b())
	})

	it("producesValuesWithinZeroToOne", () => {
		const rng = makeRng(7)
		for (let i = 0; i < 1000; i++) {
			const v = rng()
			expect(v).toBeGreaterThanOrEqual(0)
			expect(v).toBeLessThan(1)
		}
	})
})

describe("createRng.randint", () => {
	it("returnsValueInInclusiveRange", () => {
		const rng = createRng(99)
		for (let i = 0; i < 500; i++) {
			const v = rng.randint(3, 7)
			expect(v).toBeGreaterThanOrEqual(3)
			expect(v).toBeLessThanOrEqual(7)
		}
	})

	it("returnsFixedValueWhenBoundsAreEqual", () => {
		const rng = createRng(12345)
		for (let i = 0; i < 50; i++) {
			expect(rng.randint(5, 5)).toBe(5)
		}
	})
})

describe("createRng sampling helpers", () => {
	it("supports uniform choice and shuffle helpers", () => {
		const rng = createRng(77)
		const values = ["a", "b", "c", "d"]

		expect(rng.uniform(3, 4)).toBeGreaterThanOrEqual(3)
		expect(rng.uniform(3, 4)).toBeLessThan(4)
		expect(values).toContain(rng.choice(values))
		expect(rng.shuffle(values)).toHaveLength(values.length)
		expect(rng.sample(values, 2)).toHaveLength(2)
	})

	it("returns undefined for non-positive weighted totals by default", () => {
		const rng = createRng(13)

		expect(rng.weightedChoice<string>([])).toBeUndefined()
		expect(
			rng.weightedChoice([
				{ v: "fallback", w: 0 },
				{ v: "ignored", w: -2 },
			]),
		).toBeUndefined()
		expect(
			rng.weightedSample(
				[
					{ v: "x", w: 1 },
					{ v: "y", w: 1 },
				],
				5,
			),
		).toHaveLength(2)
	})

	it("can opt into first-item fallback for non-positive weighted totals", () => {
		const rng = createStringRng("seed-3", {
			nonPositiveWeightBehavior: "first",
		})

		expect(
			rng.weightedChoice([
				{ v: "fallback", w: 0 },
				{ v: "ignored", w: -2 },
			]),
		).toBe("fallback")
		expect(rng.weightedSample([{ v: "solo", w: 1 }], 3, false)).toEqual([
			"solo",
			"solo",
			"solo",
		])
	})
})

describe("makeRandInt", () => {
	it("returnsValueLessThanN", () => {
		const randint = makeRandInt(11)
		for (let i = 0; i < 500; i++) {
			expect(randint(10)).toBeLessThan(10)
		}
	})

	it("returnsNonNegativeValue", () => {
		const randint = makeRandInt(11)
		for (let i = 0; i < 500; i++) {
			expect(randint(10)).toBeGreaterThanOrEqual(0)
		}
	})
})

describe("seedStringToNumber", () => {
	it("is deterministic for string seeds", () => {
		expect(seedStringToNumber("seed-1")).toBe(seedStringToNumber("seed-1"))
		expect(seedStringToNumber("seed-1")).not.toBe(seedStringToNumber("seed-2"))
	})

	it("hashes colon-delimited seeds instead of truncating at the prefix", () => {
		const heritageA = createStringRng("heritage:101")
		const heritageB = createStringRng("heritage:202")
		const cultureA = createStringRng("culture:101")

		expect([heritageA.random(), heritageA.random()]).not.toEqual([
			heritageB.random(),
			heritageB.random(),
		])
		expect([heritageA.random(), heritageA.random()]).not.toEqual([
			cultureA.random(),
			cultureA.random(),
		])
	})
})
