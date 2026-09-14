import { describe, expect, it } from "vitest"
import type { OrbitBody } from "@/model/celestial/orbit-body/types"
import {
	buildCompositionDistribution,
	COMPOSITION_CATEGORIES,
	compositionSwatchColor,
} from "@/ui/wiki/stats/galaxy/galaxy-body-distributions"

function testBody(description: string): OrbitBody {
	return {
		idx: 0,
		massKg: 1,
		diameterKm: 1,
		group: "terrestrial",
		density: { earthRelative: 1, description },
		landCoverage: 0,
		orbitalPeriodDays: 1,
		siderealDayHours: 24,
		eccentricity: 0,
		inclinationDeg: 0,
		longitudeOfAscendingNodeDeg: 0,
		longitudeOfPerihelionDeg: 0,
		axialTiltDeg: 0,
	}
}

describe("composition categories", () => {
	it("includes Carbon, which generation can relabel rock/metal densities to", () => {
		expect(COMPOSITION_CATEGORIES).toContain("Carbon")
		expect(compositionSwatchColor("Carbon")).toBe("#44403c")
	})

	it("buckets carbon worlds ahead of gas envelopes in the distribution", () => {
		const buckets = buildCompositionDistribution([
			testBody("Hydrogen-Helium Envelope"),
			testBody("Carbon"),
			testBody("Mostly Rock"),
		])
		expect(buckets.map((bucket) => bucket.label)).toEqual([
			"Mostly Rock",
			"Carbon",
			"Hydrogen-Helium Envelope",
		])
		expect(buckets.find((bucket) => bucket.label === "Carbon")?.color).toBe(
			"#44403c",
		)
	})
})
