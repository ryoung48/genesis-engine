import { describe, expect, it } from "vitest"
import { ALBEDO } from "./albedo"
import { EMB_CONSTANTS } from "./constants"
import { EnergyBalanceModel } from "./index"

// Sanity checks that the smooth, temperature-driven ice-albedo feedback
// (albedo.ts) generalizes across obliquity/eccentricity instead of only
// having been tuned to reproduce Earth's own ~23.5deg/~0 config. Every case
// here uses the same default ALBEDO.BASE/ICE/GREENHOUSE_FACTOR constants an
// in-game procedurally generated world would get (no per-body overrides),
// varying only orbital/obliquity/eccentricity -- exactly the axis the user
// asked to confirm isn't overfit.

function earthLikeConfig(orbital: {
	OBLIQUITY: number
	ECCENTRICITY: number
	PERIHELION: number
}) {
	return {
		orbital,
		radius: EMB_CONSTANTS.planet.EARTH_RADIUS,
		pressure: 1.0,
		landFraction: ALBEDO.landFraction(),
		greenhouseFactor: EMB_CONSTANTS.surface.GREENHOUSE_FACTOR,
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

function poleMeanC(model: EnergyBalanceModel): number {
	// Average of the two polar-most latitude bands' annual means.
	const n = model.temperature.length
	const rowMean = (row: number[]) => row.reduce((a, b) => a + b, 0) / row.length
	return (rowMean(model.temperature[0]) + rowMean(model.temperature[n - 1])) / 2
}

function equatorMeanC(model: EnergyBalanceModel): number {
	const n = model.temperature.length
	const mid = Math.floor(n / 2)
	const rowMean = (row: number[]) => row.reduce((a, b) => a + b, 0) / row.length
	return (
		(rowMean(model.temperature[mid - 1]) + rowMean(model.temperature[mid])) / 2
	)
}

function maxAdjacentLatDeltaC(model: EnergyBalanceModel): number {
	const rowMean = (row: number[]) => row.reduce((a, b) => a + b, 0) / row.length
	const rowMeans = model.temperature.map(rowMean)
	let maxDelta = 0
	for (let i = 1; i < rowMeans.length; i++) {
		maxDelta = Math.max(maxDelta, Math.abs(rowMeans[i] - rowMeans[i - 1]))
	}
	return maxDelta
}

function seasonalAmplitudeC(
	model: EnergyBalanceModel,
	rowIndex: number,
): number {
	const row = model.temperature[rowIndex]
	return Math.max(...row) - Math.min(...row)
}

describe("EBM ice-albedo feedback generalizes across obliquity", () => {
	const cases = [
		{ label: "0deg (no tilt)", obliquity: 0 },
		{ label: "23.5deg (Earth)", obliquity: 23.5 },
		{ label: "45deg (high tilt)", obliquity: 45 },
		{ label: "80deg (extreme tilt)", obliquity: 80 },
	]

	const results = cases.map(({ label, obliquity }) => {
		const model = new EnergyBalanceModel(
			earthLikeConfig({
				OBLIQUITY: obliquity,
				ECCENTRICITY: 0,
				PERIHELION: 90,
			}),
		)
		model.runModel(30, 0.5)
		return {
			label,
			obliquity,
			globalMeanC: areaWeightedMean(model),
			poleMeanC: poleMeanC(model),
			equatorMeanC: equatorMeanC(model),
			maxAdjacentLatDeltaC: maxAdjacentLatDeltaC(model),
		}
	})

	it("stays finite and free of latitude discontinuities at every obliquity", () => {
		console.table(results)
		for (const r of results) {
			expect(Number.isFinite(r.globalMeanC)).toBe(true)
			expect(Number.isFinite(r.poleMeanC)).toBe(true)
			// A smooth ice transition should never produce a jump anywhere near
			// the size of the old hard-threshold bug (tens of degrees between
			// adjacent 5deg-wide bands); a few degrees of natural gradient is
			// expected and fine.
			expect(r.maxAdjacentLatDeltaC).toBeLessThan(15)
		}
	})

	it("warms the poles (relative to the equator) as obliquity increases", () => {
		// Physical expectation this feedback must reproduce without being told
		// Earth's specific ice line: higher obliquity spreads more annual-mean
		// insolation onto the poles, so they should warm relative to the
		// equator (and need less ice) purely from the temperature-driven
		// mechanism -- nothing in albedo.ts references obliquity directly.
		const gap = (r: (typeof results)[number]) => r.equatorMeanC - r.poleMeanC
		const noTilt = results.find((r) => r.obliquity === 0)!
		const earth = results.find((r) => r.obliquity === 23.5)!
		const highTilt = results.find((r) => r.obliquity === 45)!
		const extremeTilt = results.find((r) => r.obliquity === 80)!

		expect(gap(noTilt)).toBeGreaterThan(gap(earth))
		expect(gap(earth)).toBeGreaterThan(gap(highTilt))
		expect(gap(highTilt)).toBeGreaterThan(gap(extremeTilt))
		// At extreme tilt the poles should end up warmer than the equator on
		// an annual-mean basis (they receive more annual sunlight than the
		// equator does past ~54deg obliquity) -- the classic high-obliquity
		// climate inversion, which only falls out correctly if the ice
		// feedback is genuinely temperature-driven rather than latitude-baked.
		expect(gap(extremeTilt)).toBeLessThan(0)
	})
})

describe("EBM ice-albedo feedback generalizes across eccentricity", () => {
	const cases = [
		{ label: "circular (e=0)", eccentricity: 0 },
		{ label: "moderate (e=0.3)", eccentricity: 0.3 },
		{ label: "extreme (e=0.6)", eccentricity: 0.6 },
	]

	const results = cases.map(({ label, eccentricity }) => {
		const model = new EnergyBalanceModel(
			earthLikeConfig({
				OBLIQUITY: 23.5,
				ECCENTRICITY: eccentricity,
				PERIHELION: 90,
			}),
		)
		model.runModel(30, 0.5)
		const n = model.temperature.length
		return {
			label,
			eccentricity,
			globalMeanC: areaWeightedMean(model),
			maxAdjacentLatDeltaC: maxAdjacentLatDeltaC(model),
			equatorSeasonalAmplitudeC: seasonalAmplitudeC(model, Math.floor(n / 2)),
			midLatSeasonalAmplitudeC: seasonalAmplitudeC(model, Math.floor(n * 0.75)),
		}
	})

	it("stays finite and free of latitude discontinuities at every eccentricity", () => {
		console.table(results)
		for (const r of results) {
			expect(Number.isFinite(r.globalMeanC)).toBe(true)
			expect(r.maxAdjacentLatDeltaC).toBeLessThan(15)
		}
	})

	it("widens the seasonal swing as eccentricity increases", () => {
		// Higher eccentricity means a bigger perihelion/aphelion insolation
		// swing over the year -- the ice line should visibly move in and out
		// seasonally rather than sitting at a fixed annual position, which is
		// only possible because the transition reacts to the actual per-day
		// temperature the time-stepping loop already computes.
		const circular = results.find((r) => r.eccentricity === 0)!
		const extreme = results.find((r) => r.eccentricity === 0.6)!
		expect(extreme.midLatSeasonalAmplitudeC).toBeGreaterThan(
			circular.midLatSeasonalAmplitudeC,
		)
	})
})
