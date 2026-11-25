import { describe, expect, it } from "vitest"
import { SHORE_EXPOSURE } from "@/model/geography/terrain/shore/exposure"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"
import { LINE_RADIUS_KM, lineMesh } from "@/test/shore/line-mesh"

const MONTHS = 12
const LAND = 10
const COUNT = 60

interface Scenario {
	seaEnd: number
	windU: number
	iceMin?: number
}

function run({ seaEnd, windU, iceMin = 0 }: Scenario) {
	const mesh = lineMesh(COUNT)
	const isLand = new Uint8Array(COUNT)
	const openWater = new Uint8Array(COUNT)
	for (let r = 0; r < COUNT; r++) {
		if (r < LAND) isLand[r] = 1
		else if (r < seaEnd) openWater[r] = 1
		else isLand[r] = 1
	}
	return SHORE_EXPOSURE.compute({
		mesh,
		isLand,
		openWater,
		windMonthly: {
			u: new Float32Array(MONTHS * COUNT).fill(windU),
			v: new Float32Array(MONTHS * COUNT),
		},
		temperatureMonthly: new Float32Array(MONTHS * COUNT).fill(10),
		iceMinMonthly: new Float32Array(COUNT).fill(iceMin),
		iceMaxMonthly: new Float32Array(COUNT).fill(iceMin),
		planetRadiusKm: LINE_RADIUS_KM,
	})
}

describe("shore exposure", () => {
	it("classifies at the configured edges", () => {
		const [low, high] = SHORE_CONFIG.exposureEdgesM
		expect(SHORE_EXPOSURE.classOf({ exposureM: low - 0.01 })).toBe(0)
		expect(SHORE_EXPOSURE.classOf({ exposureM: low })).toBe(1)
		expect(SHORE_EXPOSURE.classOf({ exposureM: high - 0.01 })).toBe(1)
		expect(SHORE_EXPOSURE.classOf({ exposureM: high })).toBe(2)
	})

	it("shelter is 1 below the low shelter edge, 0 above the high one, and monotone", () => {
		const [low, high] = SHORE_CONFIG.shelterEdgesM
		const shelter = SHORE_EXPOSURE.shelter({
			exposureLeeM: Float32Array.of(
				0,
				low,
				low + (high - low) / 4,
				(low + high) / 2,
				high,
				high + 1,
			),
		})
		expect(shelter[0]).toBe(1)
		expect(shelter[1]).toBeCloseTo(1, 6)
		expect(shelter[3]).toBeCloseTo(0.5, 6)
		expect(shelter[4]).toBeCloseTo(0, 6)
		expect(shelter[5]).toBe(0)
		for (let i = 1; i < shelter.length; i++)
			expect(shelter[i]).toBeLessThanOrEqual(shelter[i - 1])
	})

	it("a long upwind sea is exposed and a short one is sheltered", () => {
		const wide = run({ seaEnd: COUNT - 1, windU: -10 })
		const narrow = run({ seaEnd: LAND + 3, windU: -10 })
		const wideM = wide.exposureOpenM[LAND - 1]
		const narrowM = narrow.exposureOpenM[LAND - 1]
		expect(SHORE_EXPOSURE.classOf({ exposureM: wideM })).toBe(2)
		expect(SHORE_EXPOSURE.classOf({ exposureM: narrowM })).toBe(0)
		expect(wideM).toBeGreaterThan(narrowM)
	})

	it("an offshore wind that never crosses water gives zero exposure", () => {
		const lee = run({ seaEnd: COUNT - 1, windU: 10 })
		expect(lee.exposureOpenM[LAND - 1]).toBe(0)
	})

	it("sea ice removes the wave energy", () => {
		const iced = run({ seaEnd: COUNT - 1, windU: -10, iceMin: 1 })
		expect(iced.exposureOpenM[LAND - 1]).toBe(0)
	})

	it("only coastal land carries exposure and lee never exceeds open", () => {
		const out = run({ seaEnd: COUNT - 1, windU: -10 })
		for (let r = 0; r < COUNT; r++) {
			if (r !== LAND - 1) {
				expect(out.exposureOpenM[r]).toBe(0)
				expect(out.exposureLeeM[r]).toBe(0)
			}
			expect(out.exposureLeeM[r]).toBeLessThanOrEqual(out.exposureOpenM[r])
		}
	})
})
