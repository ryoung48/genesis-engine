import { describe, expect, it } from "vitest"
import {
	DEFAULT_NATION_SECTIONS,
	DEFAULT_WORLD_SECTIONS,
	resolveDrawerStateOnOpen,
} from "./drawer-state"

describe("resolveDrawerStateOnOpen", () => {
	it("switches to the nation tab when a new nation is selected", () => {
		const result = resolveDrawerStateOnOpen({
			current: {
				tab: "world",
				openWorldSections: new Set(["environmental"]),
				openNationSections: new Set(["history"]),
			},
			selectedNationId: 12,
			previousNationId: null,
		})

		expect(result.tab).toBe("nation")
		expect(result.openWorldSections).toEqual(new Set(["environmental"]))
		expect(result.openNationSections).toEqual(new Set(["history"]))
	})

	it("falls back to the world tab when no nation remains selected", () => {
		const result = resolveDrawerStateOnOpen({
			current: {
				tab: "nation",
				openWorldSections: new Set(["social"]),
				openNationSections: new Set(["political"]),
			},
			selectedNationId: null,
			previousNationId: 12,
		})

		expect(result.tab).toBe("world")
	})

	it("preserves the current drawer state when the selection context is unchanged", () => {
		const current = {
			tab: "world" as const,
			openWorldSections: DEFAULT_WORLD_SECTIONS,
			openNationSections: DEFAULT_NATION_SECTIONS,
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
