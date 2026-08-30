import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import type {
	SpaceEngineClimateConfig,
	SpaceEngineDiurnalField,
	SpaceEngineSeasonalField,
} from "@/model/climate/temperature/spaceengine/types"

const SIGMA = CONSTANTS.embConstants.stellar.SIGMA
const DEG = Math.PI / 180
/** Nightside / deep-space floor so an airless body's dark side stays a small
 * positive number instead of collapsing to 0 K. ~3 K equivalent flux. */
const FLOOR_FLUX = SIGMA * 3 ** 4

function clampUnit(x: number): number {
	return Math.max(-1, Math.min(1, x))
}

/** Newton solve of Kepler's equation M = E - e·sin E for the eccentric
 * anomaly E, given the mean anomaly M. */
function eccentricAnomaly(meanAnomaly: number, e: number): number {
	let E = meanAnomaly
	for (let i = 0; i < 12; i++) {
		E = E - (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E))
	}
	return E
}

function trueAnomalyFromE(E: number, e: number): number {
	return (
		2 *
		Math.atan2(
			Math.sqrt(1 + e) * Math.sin(E / 2),
			Math.sqrt(1 - e) * Math.cos(E / 2),
		)
	)
}

interface OrbitState {
	/** Sub-stellar latitude (solar declination), radians. */
	declination: number
	/** Star–planet distance, metres. */
	distanceM: number
}

/** Kepler orbit -> declination + star distance at a fraction of the way
 * through the year (0 = northern spring equinox, Ls = 0). */
function orbitStateAt(
	config: SpaceEngineClimateConfig,
	yearFraction: number,
): OrbitState {
	const {
		eccentricity: e,
		perihelionDeg,
		obliquityDeg,
		semiMajorAxisM,
	} = config
	// Matches insolation/index.ts: longP orients Ls against the fixed orbit.
	const longP = perihelionDeg * DEG + Math.PI
	// Mean anomaly offset so yearFraction = 0 lands on Ls = 0: there the true
	// anomaly is -longP.
	const nuEquinox = -longP
	const eEquinox =
		2 *
		Math.atan2(
			Math.sqrt(1 - e) * Math.sin(nuEquinox / 2),
			Math.sqrt(1 + e) * Math.cos(nuEquinox / 2),
		)
	const mEquinox = eEquinox - e * Math.sin(eEquinox)

	const meanAnomaly = mEquinox + 2 * Math.PI * yearFraction
	const E = eccentricAnomaly(meanAnomaly, e)
	const trueAnomaly = trueAnomalyFromE(E, e)
	const distanceM = semiMajorAxisM * (1 - e * Math.cos(E))
	const solarLon = trueAnomaly + longP
	const declination = Math.asin(
		Math.sin(obliquityDeg * DEG) * Math.sin(solarLon),
	)
	return { declination, distanceM }
}

interface Redistribution {
	/** Longitudinal (day/night) redistribution efficiency, 0..1. */
	eps: number
	/** Meridional (pole-ward) redistribution weight, 0..1. */
	epsMerid: number
}

/**
 * Redistribution efficiency from the SpaceEngine article's two time scales:
 *  - tau_rad = cp·rho·H / (sigma·T0^3), cp·rho·H = cp·P/g (column mass per m²)
 *  - a surface parcel is pulled back into daylight by the planet's spin AND by
 *    wind advection around the globe (tau_adv = 2·pi·Rp / v_wind); the two act
 *    in parallel, giving tauDark ~ the time a parcel spends shadowed per cycle.
 * eps -> 1 when heat spreads around the latitude circle faster than the column
 * radiates it away (flat day/night); eps -> 0 when radiation wins. Airless => 0.
 */
function redistributionFor(
	config: SpaceEngineClimateConfig,
	referenceTeq: number,
): Redistribution {
	const {
		pressureBar,
		atmosphereCp,
		surfaceGravityMs2,
		windSpeedMs,
		planetRadiusM,
		hoursPerDay,
	} = config
	const pressurePa = pressureBar * 1e5
	if (pressurePa <= 0) return { eps: 0, epsMerid: 0 }
	const tauRad =
		(atmosphereCp * (pressurePa / surfaceGravityMs2)) /
		(SIGMA * referenceTeq ** 3)
	const solarDaySec = Math.max(hoursPerDay * 3600, 1)
	const tauAdvWind = (2 * Math.PI * planetRadiusM) / Math.max(windSpeedMs, 0.01)
	const tCircuit = 1 / (1 / solarDaySec + 1 / tauAdvWind)
	const tauDark = tCircuit / (2 * Math.PI)
	const eps = tauRad / (tauRad + tauDark)
	return { eps, epsMerid: 0.5 * eps }
}

/** Diurnal- (and zonal-) mean of max(0, cos zenith) at a latitude, via the
 * same hour-angle integral the EBM's insolation uses. */
function meanCosZenith(latRad: number, declination: number): number {
	const sinLat = Math.sin(latRad)
	const sinDecl = Math.sin(declination)
	const cosH0 = clampUnit(-Math.tan(latRad) * Math.tan(declination))
	if (cosH0 <= -1) return sinLat * sinDecl // polar day
	if (cosH0 >= 1) return 0 // polar night
	const H0 = Math.acos(cosH0)
	return (
		(H0 * sinLat * sinDecl +
			Math.cos(latRad) * Math.cos(declination) * Math.sin(H0)) /
		Math.PI
	)
}

function referenceTeq(config: SpaceEngineClimateConfig): number {
	const S =
		SIGMA *
		config.starTemperatureK ** 4 *
		(config.starRadiusM / config.semiMajorAxisM) ** 2
	return Math.max(((S * (1 - config.bondAlbedo)) / 4 / SIGMA) ** 0.25, 3)
}

export const SPACE_ENGINE_CLIMATE = {
	/**
	 * Latitude x time-of-year field of zonal- and diurnal-mean surface
	 * temperature (°C). This is the axis that carries the season/obliquity/
	 * eccentricity signal; longitude is averaged out, so the only redistribution
	 * that matters here is the meridional blend toward the global mean.
	 */
	seasonalField: (
		config: SpaceEngineClimateConfig,
	): SpaceEngineSeasonalField => {
		const {
			starTemperatureK,
			starRadiusM,
			bondAlbedo,
			greenhouseFactor,
			internalHeatTempK = 0,
			seismologyTotalHeatingK = 0,
			numLat,
			numYearSamples,
		} = config
		const absorbFrac = 1 - bondAlbedo
		const internalFlux4 = internalHeatTempK ** 4 + seismologyTotalHeatingK ** 4
		const { epsMerid } = redistributionFor(config, referenceTeq(config))

		const latsDeg: number[] = new Array(numLat)
		for (let i = 0; i < numLat; i++) {
			latsDeg[i] = -90 + (i + 0.5) * (180 / numLat)
		}
		const yearFractions: number[] = new Array(numYearSamples)
		const zonalMeanC: number[][] = latsDeg.map(() =>
			new Array(numYearSamples).fill(0),
		)

		let maxC = -Infinity
		let minC = Infinity
		let weightedYearSum = 0
		let weightTotal = 0

		for (let k = 0; k < numYearSamples; k++) {
			const yearFraction = k / numYearSamples
			yearFractions[k] = yearFraction
			const { declination, distanceM } = orbitStateAt(config, yearFraction)
			const S = SIGMA * starTemperatureK ** 4 * (starRadiusM / distanceM) ** 2
			const globalAbsorbed4 = (S * absorbFrac) / 4 / SIGMA
			const tEq = Math.max(globalAbsorbed4 ** 0.25, 3)
			const greenhouseOffsetK = tEq * (greenhouseFactor / 4)

			for (let i = 0; i < numLat; i++) {
				const latRad = latsDeg[i] * DEG
				const meanCosZ = meanCosZenith(latRad, declination)
				const zonalFlux4 =
					Math.max(S * absorbFrac * meanCosZ, FLOOR_FLUX) / SIGMA
				let t4 = (1 - epsMerid) * zonalFlux4 + epsMerid * globalAbsorbed4
				t4 += internalFlux4
				const tC = t4 ** 0.25 + greenhouseOffsetK - 273.15
				zonalMeanC[i][k] = tC

				if (tC > maxC) maxC = tC
				if (tC < minC) minC = tC
				const w = Math.cos(latRad)
				weightedYearSum += tC * w
				weightTotal += w
			}
		}

		return {
			latsDeg,
			yearFractions,
			zonalMeanC,
			globalMeanC: weightTotal > 0 ? weightedYearSum / weightTotal : 0,
			maxC,
			minC,
			meridionalRedistribution: epsMerid,
		}
	},

	/**
	 * Temperature around one solar day, one curve per requested latitude, at a
	 * fixed time of year -- the SpaceEngine longitudinal day/night profile.
	 * Nearly flat for a fast rotator with a thick atmosphere (eps -> 1); a deep
	 * night-side trough for a thin/absent atmosphere (eps -> 0). Each curve also
	 * reports its sunrise/sunset local hours (or polar day/night) so the caller
	 * can mark noon / sunset / midnight / sunrise.
	 */
	diurnalField: (
		config: SpaceEngineClimateConfig,
		params: { yearFraction: number },
	): SpaceEngineDiurnalField => {
		const {
			starTemperatureK,
			starRadiusM,
			bondAlbedo,
			greenhouseFactor,
			internalHeatTempK = 0,
			seismologyTotalHeatingK = 0,
			numDaySamples,
			diurnalLatitudesDeg,
		} = config
		const { yearFraction } = params
		const absorbFrac = 1 - bondAlbedo
		const internalFlux4 = internalHeatTempK ** 4 + seismologyTotalHeatingK ** 4
		// Longitudinal profile only -- no meridional blend (that belongs to the
		// seasonal/zonal field, and here it would just halve the day/night signal
		// SpaceEngine's longitudinal figure is meant to show).
		const { eps } = redistributionFor(config, referenceTeq(config))

		const { declination, distanceM } = orbitStateAt(config, yearFraction)
		const S = SIGMA * starTemperatureK ** 4 * (starRadiusM / distanceM) ** 2
		const globalAbsorbed4 = (S * absorbFrac) / 4 / SIGMA
		const tEq = Math.max(globalAbsorbed4 ** 0.25, 3)
		const greenhouseOffsetK = tEq * (greenhouseFactor / 4)
		const sinDecl = Math.sin(declination)
		const cosDecl = Math.cos(declination)

		const localHours: number[] = new Array(numDaySamples)
		for (let h = 0; h < numDaySamples; h++) {
			localHours[h] = (h / (numDaySamples - 1)) * 24
		}

		const curves = diurnalLatitudesDeg.map((latitudeDeg) => {
			const latRad = latitudeDeg * DEG
			const sinLat = Math.sin(latRad)
			const cosLat = Math.cos(latRad)
			const zonalFlux4 =
				Math.max(
					S * absorbFrac * meanCosZenith(latRad, declination),
					FLOOR_FLUX,
				) / SIGMA

			// Sunrise/sunset from the hour angle where cos(zenith) crosses 0.
			const cosH0raw = -Math.tan(latRad) * Math.tan(declination)
			let polar: "day" | "night" | null = null
			let sunriseHour: number | null = null
			let sunsetHour: number | null = null
			if (cosH0raw <= -1) polar = "day"
			else if (cosH0raw >= 1) polar = "night"
			else {
				const H0 = Math.acos(cosH0raw)
				sunsetHour = 12 + (H0 * 12) / Math.PI
				sunriseHour = 12 - (H0 * 12) / Math.PI
			}

			const temperatureC: number[] = new Array(numDaySamples)
			let sum = 0
			let maxC = -Infinity
			let minC = Infinity
			for (let h = 0; h < numDaySamples; h++) {
				// hour 0/24 = midnight (sun opposite), hour 12 = noon.
				const hourAngle = Math.PI * (localHours[h] / 12 - 1)
				const cosZ = sinLat * sinDecl + cosLat * cosDecl * Math.cos(hourAngle)
				const instFlux4 =
					Math.max(S * absorbFrac * Math.max(0, cosZ), FLOOR_FLUX) / SIGMA
				let t4 = (1 - eps) * instFlux4 + eps * zonalFlux4
				t4 += internalFlux4
				const tC = t4 ** 0.25 + greenhouseOffsetK - 273.15
				temperatureC[h] = tC
				sum += tC
				if (tC > maxC) maxC = tC
				if (tC < minC) minC = tC
			}

			return {
				latitudeDeg,
				temperatureC,
				sunriseHour,
				sunsetHour,
				polar,
				meanC: sum / numDaySamples,
				rangeC: maxC - minC,
			}
		})

		return { yearFraction, localHours, curves, redistribution: eps }
	},
}
