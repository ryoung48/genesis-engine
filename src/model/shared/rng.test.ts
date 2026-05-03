import { describe, expect, it } from "vitest"
import { createRng, makeRandInt, makeRng } from "./rng"

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
