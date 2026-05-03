import { describe, expect, it } from "vitest"
import { APP_PATHS } from "./app-routes"

describe("APP_PATHS", () => {
	it("keeps the tectonic lab at the root path", () => {
		expect(APP_PATHS.tectonicLab).toBe("/")
	})

	it("does not expose removed legacy paths", () => {
		expect(APP_PATHS).toEqual({ tectonicLab: "/" })
	})
})
