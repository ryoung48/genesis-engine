import { describe, it } from "vitest"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model"

// Ad-hoc realism check for Mars's EBM output against its known real climate.
// Uses the exact per-body values from sol-system.ts's Mars entry (au,
// tiltDeg, eccentricity, rotationHours, albedo, greenhouseFactor) plus
// Kepler's third law for the orbital period, so this mirrors what the app
// actually simulates rather than a hand-tuned standalone config.
function marsConfig() {
	const auMars = 1.524
	const eccentricity = 0.0934
	const obliquity = 25.19
	const rotationHours = 24.62296224
	const orbitalPeriodDays = Math.pow(auMars, 1.5) * 365.25636 // Kepler III, M_sun >> m_Mars

	return {
		orbital: {
			OBLIQUITY: obliquity,
			ECCENTRICITY: eccentricity,
			// NOT sol-system.ts's longitudeOfPerihelionDeg (336.041) -- that's
			// the fixed J2000-ecliptic-frame value, but insolation/index.ts's
			// PERIHELION input is (Ls_at_perihelion - 180), i.e. Ls_aphelion in
			// the planet's OWN areocentric solar-longitude frame (confirmed by
			// reproducing the raw insolation math standalone: 336.041 puts
			// peak south-pole insolation lower than north's, backwards from
			// real Mars; 71 -- the well-known real Ls_aphelion -- puts the
			// perihelion date at trueL=250.8 deg, matching the famous real
			// Ls=251 deg Mars-perihelion fact and correctly makes southern
			// summer the hotter one).
			PERIHELION: 71,
		},
		stellar: {
			...CONSTANTS.embConstants.stellar,
			AU: auMars * CONSTANTS.embConstants.stellar.AU,
		},
		time: {
			HOURS_PER_DAY: rotationHours,
			YEAR_LENGTH_DAYS: orbitalPeriodDays,
		},
		radius: 0.532 * 6_371_000, // diameterEarths ratio == radius ratio, in meters
		pressure: 0.006,
		albedo: 0.25,
		iceAlbedoFeedback: false, // real, measured Bond albedo -- don't let synthetic ice override it
		greenhouseFactor: 0.0084,
		landFraction: new Array(CONSTANTS.embConstants.grid.NUM_LAT).fill(1), // ~0 surface water
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

describe("Mars EBM realism check", () => {
	it("reports global/latitude/seasonal stats vs. known real Mars climate", () => {
		const model = new EnergyBalanceModel(marsConfig())
		model.runModel({ years: 30, dtDays: 0.5 })

		const globalMean = areaWeightedMean(model)

		let globalMin = Infinity
		let globalMax = -Infinity
		for (const row of model.temperature) {
			for (const v of row) {
				if (v < globalMin) globalMin = v
				if (v > globalMax) globalMax = v
			}
		}

		console.log("\n=== Mars EBM realism check ===")
		console.log(
			`Global area-weighted mean: ${globalMean.toFixed(1)} C  (real: ~-63 C)`,
		)
		console.log(
			`Global min/max across the year: ${globalMin.toFixed(1)} C / ${globalMax.toFixed(1)} C  (real: ~-153 C polar winter / ~+20 C equatorial summer noon)`,
		)

		console.log("\nBy-latitude annual mean and seasonal swing:")
		for (let i = 0; i < model.lats_deg.length; i += 3) {
			const row = model.temperature[i]
			const mean = row.reduce((a, b) => a + b, 0) / row.length
			const lo = Math.min(...row)
			const hi = Math.max(...row)
			console.log(
				`  lat ${model.lats_deg[i].toFixed(0).padStart(4)}: mean ${mean.toFixed(1).padStart(6)} C, range [${lo.toFixed(1)}, ${hi.toFixed(1)}]`,
			)
		}

		// Rough hemisphere asymmetry check: Mars's real eccentricity (0.093)
		// plus perihelion near southern summer solstice makes southern summers
		// noticeably hotter/shorter and winters colder than the north.
		const southPoleRow = model.temperature[0]
		const northPoleRow = model.temperature[model.temperature.length - 1]
		console.log(
			`\nSouth pole range: [${Math.min(...southPoleRow).toFixed(1)}, ${Math.max(...southPoleRow).toFixed(1)}]`,
		)
		console.log(
			`North pole range: [${Math.min(...northPoleRow).toFixed(1)}, ${Math.max(...northPoleRow).toFixed(1)}]`,
		)
	})
})
