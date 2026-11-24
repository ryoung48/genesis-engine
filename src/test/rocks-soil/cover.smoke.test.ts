import { describe, expect, it } from "vitest"
import { COVER_ROCK } from "@/model/geography/terrain/rocks/cover"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"

const NONE = { carb: 0, salt: 0, organic: 0, marine: 0 }

function shaleShare(facies: typeof NONE): number {
	const draws = 1000
	let shale = 0
	for (let i = 0; i < draws; i++)
		if (COVER_ROCK.kind({ facies, draw: (i + 0.5) / draws }) === "shale")
			shale++
	return shale / draws
}

describe("cover rock", () => {
	it("is limestone wherever the carbonate facies fills the column", () => {
		for (const draw of [0, 0.3, 0.99])
			expect(COVER_ROCK.kind({ facies: { ...NONE, carb: 1 }, draw })).toBe(
				"limestone",
			)
	})

	it("lays limestone in proportion to the carbonate facies times the carbonate gain", () => {
		const draws = 1000
		const carb = 0.2
		let limestone = 0
		for (let i = 0; i < draws; i++)
			if (
				COVER_ROCK.kind({
					facies: { ...NONE, carb },
					draw: (i + 0.5) / draws,
				}) === "limestone"
			)
				limestone++
		expect(limestone / draws).toBeCloseTo(SURFACE_CONFIG.carbGain * carb, 2)
	})

	it("is salt only inside the salt share of an evaporite column", () => {
		const facies = { ...NONE, salt: 1 }
		expect(COVER_ROCK.kind({ facies, draw: 0 })).toBe("salt")
		expect(COVER_ROCK.kind({ facies, draw: 0.999 })).not.toBe("salt")
	})

	it("favours shale in marine and organic facies, capped at the shale maximum", () => {
		expect(shaleShare({ ...NONE, marine: 1 })).toBeGreaterThan(shaleShare(NONE))
		expect(shaleShare({ ...NONE, organic: 1 })).toBeGreaterThan(
			shaleShare(NONE),
		)
		expect(shaleShare({ ...NONE, marine: 1, organic: 1 })).toBeLessThanOrEqual(
			SURFACE_CONFIG.shaleMax + 1e-9,
		)
	})

	it("strips cover from high ground and glaciated ground", () => {
		const coverKm = SURFACE_CONFIG.coverShowKm + 0.05
		expect(COVER_ROCK.shown({ coverKm, heightKm: 0, glaciated: false })).toBe(
			true,
		)
		expect(COVER_ROCK.shown({ coverKm, heightKm: 8, glaciated: false })).toBe(
			false,
		)
		expect(
			COVER_ROCK.shownKm({ coverKm, heightKm: 0, glaciated: true }),
		).toBeLessThan(
			COVER_ROCK.shownKm({ coverKm, heightKm: 0, glaciated: false }),
		)
	})
})
