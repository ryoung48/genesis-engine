import { describe, expect, it } from "vitest"
import {
	clampVolcanism,
	getLegacyVolcanismEquivalent,
	getVolcanismOverdrive,
} from "./volcanism"

describe("volcanism scale helpers", () => {
	it("maps the new 0-10 scale onto the legacy 0-1 range through value 2", () => {
		expect(clampVolcanism(undefined)).toBe(1)
		expect(clampVolcanism(12)).toBe(10)
		expect(getLegacyVolcanismEquivalent(0)).toBe(0)
		expect(getLegacyVolcanismEquivalent(1)).toBe(0.5)
		expect(getLegacyVolcanismEquivalent(2)).toBe(1)
		expect(getLegacyVolcanismEquivalent(10)).toBe(1)
	})

	it("only applies overdrive above the legacy-equivalent ceiling", () => {
		expect(getVolcanismOverdrive(0)).toBe(0)
		expect(getVolcanismOverdrive(2)).toBe(0)
		expect(getVolcanismOverdrive(3)).toBeGreaterThan(0)
		expect(getVolcanismOverdrive(10)).toBe(1)
	})
})
