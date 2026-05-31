import { describe, expect, it } from "vitest"
import { getEraConfig } from "./eras"

describe("era statehood", () => {
	it("reaches full statehood by late medieval", () => {
		expect(getEraConfig("lateMedieval").statehoodFraction).toBe(1.0)
		expect(getEraConfig("earlyModern").statehoodFraction).toBe(1.0)
		expect(getEraConfig("industrial").statehoodFraction).toBe(1.0)
		expect(getEraConfig("information").statehoodFraction).toBe(1.0)
	})

	it("keeps earlier eras below full statehood", () => {
		expect(getEraConfig("iron").statehoodFraction).toBeLessThan(1.0)
		expect(getEraConfig("bronze").statehoodFraction).toBeLessThan(1.0)
		expect(getEraConfig("neolithic").statehoodFraction).toBeLessThan(1.0)
	})

	it("raises statehood across eras toward late medieval full coverage", () => {
		expect(getEraConfig("iron").statehoodFraction).toBeGreaterThan(
			getEraConfig("bronze").statehoodFraction,
		)
		expect(getEraConfig("lateMedieval").statehoodFraction).toBeGreaterThan(
			getEraConfig("iron").statehoodFraction,
		)
	})
})
