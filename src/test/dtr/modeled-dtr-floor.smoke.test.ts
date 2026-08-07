import { describe, expect, it } from "vitest"
import { DTR } from "@/model/climate/dtr"
import type { GenesisRainfall } from "@/model/climate/types"

function createRainfall({ rainMm }: { rainMm: number }): GenesisRainfall {
	return {
		monthly: new Float32Array(12).fill(rainMm),
		annual: new Float32Array([rainMm * 12]),
		east: new Float32Array(1),
		west: new Float32Array(1),
	}
}

describe("modeled DTR", () => {
	it("keeps land and ocean DTR at or above 6 °C", () => {
		for (const isLand of [0, 1]) {
			const { monthly, annual } = DTR.computeDiurnalRange({
				rainfall: createRainfall({ rainMm: isLand ? 10_000 : 0 }),
				elevationKm: new Float32Array(1),
				oceanDist: new Float32Array(1),
				isLand: new Uint8Array([isLand]),
				params: { hoursPerDay: 6, tideLock: null },
				daylight_hours_monthly: new Float32Array(12),
			})

			for (const dtr of monthly) expect(dtr).toBeGreaterThanOrEqual(6)
			for (const dtr of annual) expect(dtr).toBeGreaterThanOrEqual(6)
		}
	})
})
