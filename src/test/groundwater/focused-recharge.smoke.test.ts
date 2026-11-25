import { describe, expect, it } from "vitest"
import { FOCUSED_RECHARGE } from "@/model/geography/terrain/groundwater/focused-recharge"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG
const SECONDS = 3.15576e7
const MONTHS = 12

function run({
	flow,
	width,
	dry = 1,
	pet = 1500,
	rain = 100,
}: {
	flow: number
	width: number
	dry?: number
	pet?: number
	rain?: number
}) {
	return FOCUSED_RECHARGE.perRegion({
		flowMonthly: new Float32Array(MONTHS).fill(flow),
		flowAnnual: Float32Array.of(flow),
		areaM2: Float64Array.of(width * width),
		widthM: Float64Array.of(width),
		pet: Float32Array.of(pet),
		rain: Float32Array.of(rain),
		dry: Uint8Array.of(dry),
		secondsPerYear: SECONDS,
	})
}

describe("focused recharge", () => {
	it("never exceeds the monthly flow and is zero for wet regions", () => {
		for (const flow of [0.5, 5, 50, 500, 5000]) {
			const result = run({ flow, width: 60000 })
			expect(result.channelM3s[0]).toBeLessThanOrEqual(flow)
		}
		const wet = run({ flow: 100, width: 60000, dry: 0 })
		expect(wet.channelM3s[0]).toBe(0)
		expect(wet.sustainedBand[0]).toBe(0)
	})

	it("rises with flow and with region width", () => {
		const small = run({ flow: 1, width: 60000 }).channelM3s[0]
		const large = run({ flow: 10, width: 60000 }).channelM3s[0]
		expect(large).toBeGreaterThan(small)
		const narrow = run({ flow: 50, width: 40000 }).channelM3s[0]
		const wide = run({ flow: 50, width: 80000 }).channelM3s[0]
		expect(wide).toBeGreaterThan(narrow)
	})

	it("caps the valley share at fVMax and the sustained band at the valley share", () => {
		const result = run({ flow: 5000, width: 20000 })
		expect(result.valleyShare[0]).toBeLessThanOrEqual(C.fVMax)
		expect(result.sustainedBand[0]).toBeLessThanOrEqual(result.valleyShare[0])
	})

	it("supplies the whole band when channel loss covers demand and less below", () => {
		const supplied = run({ flow: 2000, width: 40000, pet: 300, rain: 290 })
		expect(supplied.sustainedBand[0]).toBeCloseTo(supplied.valleyShare[0], 6)
		const starved = run({ flow: 2, width: 200000, pet: 2500, rain: 0 })
		expect(starved.sustainedBand[0]).toBeLessThan(starved.valleyShare[0])
	})

	it("valley width is clamped", () => {
		expect(FOCUSED_RECHARGE.valleyWidthM({ flowM3s: 0 })).toBeCloseTo(
			C.floodWidthMinKm * 1000,
			6,
		)
		expect(FOCUSED_RECHARGE.valleyWidthM({ flowM3s: 1e9 })).toBeCloseTo(
			C.floodWidthMaxKm * 1000,
			6,
		)
	})
})
