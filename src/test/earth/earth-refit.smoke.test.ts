import { describe, it } from "vitest"
import { ALBEDO } from "@/model/climate/ebm/albedo"
import { CONSTANTS } from "@/model/climate/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/ebm/energy-balance-model"

// Pins Earth's greenhouseFactor for the no-ice-feedback configuration (an
// explicit, empirically-measured whole-body albedo with the temperature-
// driven ice transition turned off -- see EBMConfig.iceAlbedoFeedback doc).
// See earth-default-refit.smoke.test.ts for the real in-game default path
// (no albedo override, ice feedback on), which is the one that needs to stay
// fitted for computeTemperature()'s actual generation behavior.
function earthConfig(greenhouseFactor: number) {
	return {
		orbital: { ...CONSTANTS.embConstants.orbital },
		radius: CONSTANTS.embConstants.planet.EARTH_RADIUS,
		pressure: 1.0,
		albedo: CONSTANTS.embConstants.surface.ALBEDO.BASE,
		iceAlbedoFeedback: false,
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
			model.runModel({ years: 30, dtDays: 0.5 })
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
