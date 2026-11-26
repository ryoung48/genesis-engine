import { describe, expect, it } from "vitest"
import { STONE } from "@/model/geography/terrain/deposits/stone"

describe("rock-derived deposits", () => {
	it("gets ice-scoured stone 1.25 times as easily as the same rock on a plain", () => {
		const base = { young: false, hills: 0, deepRed: 0 }
		const plain = STONE.access({ ...base, glaciated: false })
		const scoured = STONE.access({ ...base, glaciated: true })
		expect(scoured / plain).toBeCloseTo(1.25, 6)
	})

	it("buries stone under young sediment and weathers it under deep red soil", () => {
		const open = { hills: 0.5, deepRed: 0, glaciated: false }
		expect(STONE.access({ ...open, young: true })).toBe(0)
		expect(STONE.access({ ...open, young: false, deepRed: 1 })).toBeLessThan(
			STONE.access({ ...open, young: false }),
		)
	})

	it("makes sand of every erg and of sandy coasts, and none under ice", () => {
		const base = {
			erg: false,
			coastal: false,
			sandPercent: 90,
			glaciated: false,
			variety: 1,
		}
		expect(STONE.sand({ ...base, erg: true })).toBeCloseTo(0.8, 6)
		expect(STONE.sand({ ...base, erg: true, variety: 0 })).toBeCloseTo(0.2, 6)
		expect(STONE.sand(base)).toBe(0)
		expect(STONE.sand({ ...base, coastal: true })).toBeCloseTo(0.75, 6)
		expect(STONE.sand({ ...base, coastal: true, sandPercent: 40 })).toBe(0)
		expect(STONE.sand({ ...base, erg: true, glaciated: true })).toBe(0)
	})

	it("makes clay richer on level ground than in hill country", () => {
		expect(STONE.clay({ host: 1, hills: 0, variety: 1 })).toBeGreaterThan(
			STONE.clay({ host: 1, hills: 1, variety: 1 }),
		)
	})
})
