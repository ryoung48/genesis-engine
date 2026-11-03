import type {
	LockedRain,
	LockedRainParams,
	NightSnowPoint,
	PotentialEvaporationParams,
} from "@/model/climatev2/rain/locked/types"
import { PARAMS } from "@/model/climatev2/vendor/config.js"
import { lockedSunAt, orbitOf } from "@/model/climatev2/vendor/insolation.js"
import {
	PSYCHRO_HPA,
	seaEvaporationScale,
	surfaceWind,
} from "@/model/climatev2/vendor/pressure.js"
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
// The nightside's mean snowfall in the climate models of Earth-like locked planets at Earth's starlight, by their
// rotation (= orbital) period: Menou 2013, "Water-Trapped Worlds", Table 1 — 0.29 mm/day at 120 h (Earth.fast), 0.12
// at 240 h (Earth1–3: 0.12, 0.11, 0.26) and 0.009 at 480 h (Earth.slow); between them in log–log, held beyond. A
// slower planet carries less of its water past the terminator (Merlis & Schneider 2010)
const NIGHT_SNOW: NightSnowPoint[] = [
	{ hours: 120, mmPerDay: 0.29 },
	{ hours: 240, mmPerDay: 0.12 },
	{ hours: 480, mmPerDay: 0.009 },
]

// Where the dayside's water rains out. The surface winds converge on the substellar point, and Merlis & Schneider 2010
// (slowly rotating locked aquaplanet) find a convergence zone there of rain ≥ 40 mm/day, rain above evaporation only
// near it, and the rest of the dayside evaporating more than it rains. So CONVERGED_SHARE of the water falls in a
// Gaussian core about the substellar point of width CORE_DEG — their convergence zone's scale, the equatorial Rossby
// radius ≈ 10° — and the rest by the surface's sunlight, as the evaporation goes, to the terminator (rain falls below
// evaporation beyond ≈ 24°). 0.4 puts the core's peak at ≈ 7× the substellar evaporation, within the 5–8× of their 40 mm/day
// against a subsolar evaporation of a sunlit warm sea's ≈ 5–8 mm/day
const CONVERGED_SHARE = 0.4
const CORE_DEG = 10

const nightSnow = (hours: number) => {
	const first = NIGHT_SNOW[0]
	const last = NIGHT_SNOW[NIGHT_SNOW.length - 1]
	if (hours <= first.hours) return first.mmPerDay
	if (hours >= last.hours) return last.mmPerDay
	const i = NIGHT_SNOW.findIndex((p) => p.hours >= hours)
	const a = NIGHT_SNOW[i - 1]
	const b = NIGHT_SNOW[i]
	const t = Math.log(hours / a.hours) / Math.log(b.hours / a.hours)
	return Math.exp(Math.log(a.mmPerDay) + t * Math.log(b.mmPerDay / a.mmPerDay))
}

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
	const nightRate = nightSnow((2 * Math.PI) / orbit.rotation / 3600) / 86400
	const eSea = new Float64Array(G)
	const eLand = new Float64Array(G)
	const sunlit = new Float64Array(G)
	const rain = new Float64Array(G)
	const core = new Float64Array(G)
	const sunNow = new Float64Array(G)
	const coreRad = (CORE_DEG * Math.PI) / 180
	anchorMonths.forEach((month, k) => {
		const s = Math.round((month * SAMPLES) / 12) % SAMPLES
		const m = ((Math.floor(month) % 12) + 12) % 12
		const o = s * G
		lockedSunAt(grid.lat, grid.lon, orbit, month, sunNow, core)
		let coreSum = 0
		for (let c = 0; c < G; c++) {
			const theta = Math.acos(Math.min(1, core[c]))
			core[c] =
				core[c] > 0 ? Math.exp(-(theta * theta) / (2 * coreRad * coreRad)) : 0
			coreSum += grid.rowArea[Math.floor(c / grid.w)] * core[c]
		}
		let sunlitSum = 0
		let dark = 0
		for (let c = 0; c < G; c++) {
			const f = surface.landFrac[c]
			const tSea = temperature.monthlySL[m * G + c]
			const tLand = tSea + temperature.inversion[m * G + c]
			const ps = orbit.pressureScale
			eSea[c] =
				seaEvaporationScale(temperature.surfaceSunScale) *
				(1 - f) *
				(1 - surf.seaIce[o + c]) *
				bulk *
				qSat(tSea)
			eLand[c] = potential({ T: tLand, net: surf.netLand[o + c], ps })
			sunlit[c] = f * surf.sunLand[o + c] + (1 - f) * surf.sunSea[o + c]
			sunlitSum += grid.rowArea[Math.floor(c / grid.w)] * sunlit[c]
			if (surf.sunLand[o + c] <= 0 && surf.sunSea[o + c] <= 0)
				dark += grid.rowArea[Math.floor(c / grid.w)]
		}
		rain.fill(0)
		for (let round = 0; round < LAND_ROUNDS; round++) {
			let water = 0
			for (let c = 0; c < G; c++) {
				const f = surface.landFrac[c]
				const e = eSea[c] + f * turcPike(rain[c], eLand[c])
				water += grid.rowArea[Math.floor(c / grid.w)] * e
			}
			const night = Math.min(water, nightRate * dark)
			for (let c = 0; c < G; c++) {
				const isDark = surf.sunLand[o + c] <= 0 && surf.sunSea[o + c] <= 0
				const day = water - night
				rain[c] =
					(sunlitSum > 0
						? ((1 - CONVERGED_SHARE) * day * sunlit[c]) / sunlitSum
						: 0) +
					(coreSum > 0 ? (CONVERGED_SHARE * day * core[c]) / coreSum : 0) +
					(isDark && dark > 0 ? night / dark : 0)
			}
		}
		for (let c = 0; c < G; c++) P[k * G + c] = rain[c] * seconds
	})
	return { P }
}

export const CLIMATEV2_LOCKED_RAIN = {
	estimate,
	potentialEvaporation: potential,
}
