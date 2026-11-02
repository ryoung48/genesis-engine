import type {
	LockedRain,
	LockedRainParams,
	PotentialEvaporationParams,
} from "@/model/climatev2/rain/locked/types"
import { PARAMS } from "@/model/climatev2/vendor/config.js"
import { orbitOf } from "@/model/climatev2/vendor/insolation.js"
import { PSYCHRO_HPA, surfaceWind } from "@/model/climatev2/vendor/pressure.js"
import {
	EARTH_SECONDS_PER_MONTH,
	LATENT,
	PT_ALPHA,
	qSat,
	RHO_AIR,
	turcPike,
} from "@/model/climatev2/vendor/rain.js"

const SAMPLES = 12
// Land's evaporation answers the rain that falls on it, which follows the evaporation: four rounds settle it to within
// a percent on the Earth fixture
const LAND_ROUNDS = 4

const potential = ({ T, net, ps }: PotentialEvaporationParams) => {
	const es = 6.112 * Math.exp((17.67 * T) / (T + 243.5))
	const slope = (es * 17.67 * 243.5) / (T + 243.5) ** 2
	return (
		(PT_ALPHA * slope * Math.max(0, net)) /
		((slope + PSYCHRO_HPA * ps) * LATENT)
	)
}

function estimate({ ctx, temperature }: LockedRainParams): LockedRain {
	const { grid, surface, anchorMonths, options } = ctx
	const surf = temperature.lockedSurf
	const G = grid.size
	const P = new Float32Array(anchorMonths.length * G)
	if (!surf) return { P }
	const orbit = orbitOf(options)
	const seconds = EARTH_SECONDS_PER_MONTH * orbit.yearScale
	const bulk =
		RHO_AIR *
		PARAMS.RAIN_EVAP_COEFF *
		surfaceWind(orbit) *
		(1 - PARAMS.RAIN_SURFACE_RH)
	const eSea = new Float64Array(G)
	const eLand = new Float64Array(G)
	const ascent = new Float64Array(G)
	const rain = new Float64Array(G)
	anchorMonths.forEach((month, k) => {
		const s = Math.round((month * SAMPLES) / 12) % SAMPLES
		const m = ((Math.floor(month) % 12) + 12) % 12
		const o = s * G
		let sun = 0
		let area = 0
		for (let c = 0; c < G; c++) {
			const f = surface.landFrac[c]
			const w = grid.rowArea[Math.floor(c / grid.w)]
			sun += w * (f * surf.sunLand[o + c] + (1 - f) * surf.sunSea[o + c])
			area += w
		}
		const meanSun = sun / area
		let rising = 0
		for (let c = 0; c < G; c++) {
			const f = surface.landFrac[c]
			const tSea = temperature.monthlySL[m * G + c]
			const tLand = tSea + temperature.inversion[m * G + c]
			const ps = orbit.pressureScale
			eSea[c] = (1 - f) * (1 - surf.seaIce[o + c]) * bulk * qSat(tSea)
			eLand[c] = potential({ T: tLand, net: surf.netLand[o + c], ps })
			ascent[c] = Math.max(
				0,
				f * surf.sunLand[o + c] + (1 - f) * surf.sunSea[o + c] - meanSun,
			)
			rising += grid.rowArea[Math.floor(c / grid.w)] * ascent[c]
		}
		rain.fill(0)
		for (let round = 0; round < LAND_ROUNDS; round++) {
			let water = 0
			for (let c = 0; c < G; c++) {
				const f = surface.landFrac[c]
				const e = eSea[c] + f * turcPike(rain[c], eLand[c])
				water += grid.rowArea[Math.floor(c / grid.w)] * e
			}
			for (let c = 0; c < G; c++)
				rain[c] = rising > 0 ? (water * ascent[c]) / rising : 0
		}
		for (let c = 0; c < G; c++) P[k * G + c] = rain[c] * seconds
	})
	return { P }
}

export const CLIMATEV2_LOCKED_RAIN = {
	estimate,
	potentialEvaporation: potential,
}
