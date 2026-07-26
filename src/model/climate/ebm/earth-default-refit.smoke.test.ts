import { describe, it } from "vitest"
import { ALBEDO } from "./albedo"
import { EMB_CONSTANTS } from "./constants"
import { EnergyBalanceModel } from "./index"

// Re-fits GREENHOUSE_FACTOR for the *actual* in-game default path --
// computeTemperature() in climate.ts builds EnergyBalanceModel with no
// albedo/iceAlbedo/iceAlbedoFeedback override, so it always gets the smooth
// temperature-driven ice transition (albedo.ts) at its default settings. That
// differs from earth-refit.smoke.test.ts, which pins iceAlbedoFeedback:false
// to keep its own (no-feedback) fitted constant stable for comparison.
function earthDefaultConfig(greenhouseFactor: number) {
	return {
		orbital: { ...EMB_CONSTANTS.orbital },
		radius: EMB_CONSTANTS.planet.EARTH_RADIUS,
		pressure: 1.0,
		landFraction: ALBEDO.landFraction(),
		greenhouseFactor,
	}
}

function areaWeightedMean(model: EnergyBalanceModel): number {
	let totalWeightedTemp = 0
	let totalArea = 0
	for (let i = 0; i < model.lats_deg.length; i++) {
		const latAvg =
			// biome-ignore lint/nursery/useMaxParams: native Array callback signature
			model.temperature[i].reduce((a, b) => a + b, 0) /
			model.temperature[i].length
		const areaWeight = model.dx[i]
		totalWeightedTemp += latAvg * areaWeight
		totalArea += areaWeight
	}
	return totalWeightedTemp / totalArea
}

describe("Earth greenhouseFactor refit (default ice-albedo feedback enabled)", () => {
	it("bisects greenhouseFactor against the real ~14.8C target", () => {
		const target = 14.8
		let lo = 0
		let hi = 3
		let bestG = hi
		let bestTemp = 0

		for (let iter = 0; iter < 40; iter++) {
			const mid = (lo + hi) / 2
			const model = new EnergyBalanceModel(earthDefaultConfig(mid))
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
