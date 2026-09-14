import { describe, expect, it } from "vitest"
import { SINGLE_STAR_BUDGET } from "@/model/celestial/system/generation/single-star-budget"

describe("Single-star budget", () => {
	it("runs the staged placement pipeline for a standalone host", () => {
		const budget = SINGLE_STAR_BUDGET.roll({
			seed: 1,
			hostStar: {
				spectralClass: "G",
				luminosityClass: "V",
				subtype: 2,
				massSol: 1,
				temperatureK: 5778,
				diameterSol: 1,
				luminositySol: 1,
				ageGyr: 4.5,
				mao: 0.1,
			},
		})
		for (const slot of budget.worldTypeAllocation.orbitSlots) {
			expect(slot.orbitalDistanceAU).not.toBeNull()
			expect(slot.deviation).not.toBeNull()
			expect(slot.zone).not.toBeNull()
		}
	})
})
