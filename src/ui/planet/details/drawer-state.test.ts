import { describe, expect, it } from "vitest"
import { resolveDrawerStateOnOpen } from "./drawer-state"

describe("resolveDrawerStateOnOpen", () => {
	it("switches to the nation tab when a new nation is selected", () => {
		const result = resolveDrawerStateOnOpen({
			current: {
				tab: "world",
				worldSection: "environmental",
				nationSection: "history",
			},
			selectedNationId: 12,
			previousNationId: null,
		})

		expect(result).toEqual({
			tab: "nation",
			worldSection: "environmental",
			nationSection: "history",
		})
	})

	it("falls back to the world tab when no nation remains selected", () => {
		const result = resolveDrawerStateOnOpen({
			current: {
				tab: "nation",
				worldSection: "social",
				nationSection: "political",
			},
			selectedNationId: null,
			previousNationId: 12,
		})

		expect(result).toEqual({
			tab: "world",
			worldSection: "social",
			nationSection: "political",
		})
	})

	it("preserves the current drawer state when the selection context is unchanged", () => {
		const current = {
			tab: "world" as const,
			worldSection: "planetary" as const,
			nationSection: "demographics" as const,
		}

		expect(
			resolveDrawerStateOnOpen({
				current,
				selectedNationId: null,
				previousNationId: null,
			}),
		).toBe(current)
	})
})
