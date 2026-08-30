import { HEAT } from "@/model/climate/temperature/tidal-locked"
import type { GenesisRainfall } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"
import { TIME } from "@/model/shared/time"

// A tidally-locked point never actually experiences a day/night transition
// (it's either permanently lit, permanently dark, or -- only near the
// terminator -- crossing between the two as libration/declination nudge the
// substellar point through the year), so the rotation-based formula below
// (built around a point cycling through day and night every rotation) does
// not apply. Real diurnal-style swing only makes sense near that terminator
// band; deep dayside/nightside get just a small floor (weather variability),
// not the same guaranteed swing a rotating world's degree-day physics would
// imply everywhere.
const LOCKED_TERMINATOR_SIGMA = 0.25
const LOCKED_FLOOR_C = 0.5
const LOCKED_LAND_PEAK_C = 9
const LOCKED_OCEAN_PEAK_C = 3.5

function computeLockedDiurnalRange(args: {
	mesh: SphereMesh
	isLand: Uint8Array
	params: Partial<
		Pick<
			GenesisParams,
			"obliquity" | "eccentricity" | "perihelion" | "substellarLon"
		>
	>
}): { monthly: Float32Array; annual: Float32Array } {
	const { mesh, isLand, params } = args
	const obliquity = params.obliquity ?? 0
	const eccentricity = params.eccentricity ?? 0
	const perihelion = params.perihelion ?? 0
	const substellarLon = params.substellarLon ?? 0
	const N = isLand.length
	const dtr_monthly = new Float32Array(12 * N)

	const monthlyLibration = HEAT.computeMonthlyLibration({
		eccentricity,
		perihelion,
	})
	const monthlyDeclination = HEAT.computeMonthlyLockedDeclination({
		obliquity,
		eccentricity,
		perihelion,
	})
	// More eccentric orbits librate the substellar point further, widening
	// the terminator's day/night wobble -- a modest amplitude boost, not a
	// new mechanism.
	const eccBoost = Math.min(2, 1 + eccentricity * 6)
	const landPeak = LOCKED_LAND_PEAK_C * eccBoost
	const oceanPeak = LOCKED_OCEAN_PEAK_C * eccBoost

	for (let month = 0; month < 12; month++) {
		const sub = HEAT.getSubstellarDirWithOffsetAndDeclination({
			substellarLon,
			lonOffsetRad: monthlyLibration[month],
			declinationRad: monthlyDeclination[month],
		})
		for (let r = 0; r < N; r++) {
			const x = mesh.r_xyz[3 * r]
			const y = mesh.r_xyz[3 * r + 1]
			const z = mesh.r_xyz[3 * r + 2]
			const cosTheta = Math.max(
				-1,
				Math.min(1, x * sub[0] + y * sub[1] + z * sub[2]),
			)
			const terminatorFactor = Math.exp(
				-(cosTheta * cosTheta) / (2 * LOCKED_TERMINATOR_SIGMA ** 2),
			)
			const peak = isLand[r] ? landPeak : oceanPeak
			dtr_monthly[month * N + r] =
				LOCKED_FLOOR_C + (peak - LOCKED_FLOOR_C) * terminatorFactor
		}
	}

	const dtr_annual = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		let sum = 0
		for (let m = 0; m < 12; m++) sum += dtr_monthly[m * N + r]
		dtr_annual[r] = sum / 12
	}
	return { monthly: dtr_monthly, annual: dtr_annual }
}

function computeDiurnalRange(args: {
	mesh?: SphereMesh
	rainfall: GenesisRainfall
	elevationKm: Float32Array
	oceanDist: Float32Array | undefined
	isLand: Uint8Array
	params?: Pick<GenesisParams, "hoursPerDay" | "pressure" | "tideLock"> &
		Partial<
			Pick<
				GenesisParams,
				"obliquity" | "eccentricity" | "perihelion" | "substellarLon"
			>
		>
	daylight_hours_monthly?: Float32Array
}): { monthly: Float32Array; annual: Float32Array } {
	const {
		mesh,
		rainfall,
		elevationKm: _elevationKm,
		oceanDist,
		isLand,
		params,
		daylight_hours_monthly,
	} = args

	if (params?.tideLock?.type === "solar" && mesh) {
		return computeLockedDiurnalRange({ mesh, isLand, params })
	}

	const N = isLand.length
	const dtr_monthly = new Float32Array(12 * N)
	const relHours = params?.hoursPerDay / TIME.hoursPerDay
	const landRegions: number[] = []
	const oceanRegions: number[] = []
	for (let r = 0; r < N; r++) {
		if (isLand[r]) landRegions.push(r)
		else oceanRegions.push(r)
	}

	for (const r of oceanRegions) {
		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			const rain = 300
			const dayFrac = daylight_hours_monthly[idx] / params?.hoursPerDay
			const daylightWet = 1 - Math.E ** (-rain / 100)
			const daylightAmp = 0.6 * (1 - 0.5 * daylightWet)
			const daylightFactor = 1 - daylightAmp * (2 * dayFrac - 1) ** 2
			const oceanVariability = 3 * relHours ** 0.55 * daylightFactor
			dtr_monthly[idx] = 4 + oceanVariability
		}
	}

	for (const r of landRegions) {
		const distKm = oceanDist ? oceanDist[r] : 0

		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			const rain = rainfall.monthly[idx]
			const dayFrac = daylight_hours_monthly[idx] / params?.hoursPerDay
			const daylightWet = 1 - Math.E ** (-rain / 100)
			const daylightAmp = 0.6 * (1 - 0.5 * daylightWet)
			const daylightFactor = 1 - daylightAmp * (2 * dayFrac - 1) ** 2
			const rainVariability = 8.5 * Math.E ** (-rain / 85)
			const dayAlpha = 0.2 + 0.23 * Math.E ** (-rain / 90)
			const dayFactor = relHours ** dayAlpha

			const landAlpha = 0.08 + 0.37 * Math.E ** (-rain / 85)
			const landFactor = Math.min(1, 1 - Math.E ** (-distKm / 1200))

			dtr_monthly[idx] =
				5 +
				rainVariability *
					dayFactor *
					(1 + landFactor * landAlpha) *
					daylightFactor
		}
	}

	const dtr_annual = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		let sum = 0
		for (let m = 0; m < 12; m++) sum += dtr_monthly[m * N + r]
		dtr_annual[r] = sum / 12
	}
	return { monthly: dtr_monthly, annual: dtr_annual }
}

export const DTR = {
	computeDiurnalRange,
}
