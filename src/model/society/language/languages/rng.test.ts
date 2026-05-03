import { describe, expect, it } from "vitest"
import { createLanguageRng } from "./rng"

describe("createLanguageRng", () => {
	it("is deterministic for the same seed", () => {
		const a = createLanguageRng("seed-1")
		const b = createLanguageRng("seed-1")

		expect([a.random, a.random, a.randint(1, 5)]).toEqual([
			b.random,
			b.random,
			b.randint(1, 5),
		])
	})

	it("supports weighted and unweighted sampling", () => {
		const rng = createLanguageRng("seed-2")
		const values = ["a", "b", "c", "d"]

		expect(values).toContain(rng.choice(values))
		expect(rng.sample(values, 2)).toHaveLength(2)
		expect(
			rng.weightedChoice([
				{ v: "left", w: 1 },
				{ v: "right", w: 3 },
			]),
		).toMatch(/left|right/)
		expect(
			rng.weightedSample(
				[
					{ v: "x", w: 1 },
					{ v: "y", w: 1 },
					{ v: "z", w: 1 },
				],
				2,
			),
		).toHaveLength(2)
	})

	it("covers hashed seeds and weighted fallback branches", () => {
		const hashedA = createLanguageRng("0")
		const hashedB = createLanguageRng("0")

		expect([hashedA.random, hashedA.random]).toEqual([
			hashedB.random,
			hashedB.random,
		])

		const rng = createLanguageRng("seed-3")
		expect(rng.weightedChoice<string>([])).toBeUndefined()
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

	it("hashes colon-delimited seeds instead of truncating at the prefix", () => {
		const heritageA = createLanguageRng("heritage:101")
		const heritageB = createLanguageRng("heritage:202")
		const cultureA = createLanguageRng("culture:101")

		expect([heritageA.random, heritageA.random]).not.toEqual([
			heritageB.random,
			heritageB.random,
		])
		expect([heritageA.random, heritageA.random]).not.toEqual([
			cultureA.random,
			cultureA.random,
		])
	})
})
