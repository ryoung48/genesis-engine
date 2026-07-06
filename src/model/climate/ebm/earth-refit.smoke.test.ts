import { describe, it } from "vitest"
import { ALBEDO } from "./albedo"
import { EMB_CONSTANTS } from "./constants"
import { EnergyBalanceModel } from "./index"

// Re-fits Earth's greenhouseFactor now that ice-albedo feedback is disabled
// in albedo.ts (see luna-repro discussion) -- the old 0.55 was fit against
// the ice-albedo-feedback model, so it no longer reproduces ~14.8C now that
// poles no longer get an extra reflective boost.
function earthConfig(greenhouseFactor: number) {
	return {
		orbital: { ...EMB_CONSTANTS.orbital },
		radius: EMB_CONSTANTS.planet.EARTH_RADIUS,
		pressure: 1.0,
		albedo: EMB_CONSTANTS.surface.ALBEDO.BASE,
		landFraction: ALBEDO.landFraction(),
		greenhouseFactor,
	}
}

function areaWeightedMean(model: EnergyBalanceModel): number {
	let totalWeightedTemp = 0
	let totalArea = 0
	for (let i = 0; i < model.lats_deg.length; i++) {
		const latAvg =
			model.temperature[i].reduce((a, b) => a + b, 0) /
			model.temperature[i].length
		const areaWeight = model.dx[i]
		totalWeightedTemp += latAvg * areaWeight
		totalArea += areaWeight
	}
	return totalWeightedTemp / totalArea
}

describe("Earth greenhouseFactor refit (ice-albedo feedback disabled)", () => {
	it("bisects greenhouseFactor against the real ~14.8C target", () => {
		const target = 14.8
		let lo = 0
		let hi = 3
		let bestG = hi
		let bestTemp = 0

		for (let iter = 0; iter < 40; iter++) {
			const mid = (lo + hi) / 2
			const model = new EnergyBalanceModel(earthConfig(mid))
			model.runModel(30, 0.5)
			const avg = areaWeightedMean(model)
			bestG = mid
			bestTemp = avg
			if (avg < target) {
				lo = mid
			} else {
				hi = mid
			}
		}

		console.log(`fitted greenhouseFactor = ${bestG}, avgTemp = ${bestTemp}`)
	})
})
