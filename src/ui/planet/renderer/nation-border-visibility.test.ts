import { describe, expect, it } from "vitest"
import { shouldRebuildNationBordersForVisibilityChange } from "./nation-border-visibility"

describe("shouldRebuildNationBordersForVisibilityChange", () => {
	it("does not rebuild when hiding existing overlays", () => {
		expect(
			shouldRebuildNationBordersForVisibilityChange({
				nextVisible: false,
				hasGlobeOverlay: true,
				hasMapOverlay: true,
			}),
		).toBe(false)
	})

	it("does not rebuild when showing overlays that already exist", () => {
		expect(
			shouldRebuildNationBordersForVisibilityChange({
				nextVisible: true,
				hasGlobeOverlay: true,
				hasMapOverlay: true,
			}),
		).toBe(false)
	})

	it("rebuilds when showing overlays that are missing from either view", () => {
		expect(
			shouldRebuildNationBordersForVisibilityChange({
				nextVisible: true,
				hasGlobeOverlay: false,
				hasMapOverlay: true,
			}),
		).toBe(true)
		expect(
			shouldRebuildNationBordersForVisibilityChange({
				nextVisible: true,
				hasGlobeOverlay: true,
				hasMapOverlay: false,
			}),
		).toBe(true)
	})
})
