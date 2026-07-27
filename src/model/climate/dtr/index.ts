import type { GenesisParams, GenesisRainfall } from "@/model"
import { TIME } from "@/model/shared/time"

function computeDiurnalRange(args: {
	rainfall: GenesisRainfall
	elevationKm: Float32Array
	oceanDist: Float32Array | undefined
	isLand: Uint8Array
	params?: Pick<GenesisParams, "hoursPerDay" | "pressure" | "tideLock">
	daylight_hours_monthly?: Float32Array
}): { monthly: Float32Array; annual: Float32Array } {
	const {
		rainfall,
		elevationKm: _elevationKm,
		oceanDist,
		isLand,
		params,
		daylight_hours_monthly,
	} = args
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
			dtr_monthly[idx] = 3 * relHours ** 0.55 * daylightFactor
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
			const rainFactor = 4 + 12 * Math.E ** (-rain / 85)
			const dayAlpha = 0.2 + 0.23 * Math.E ** (-rain / 90)
			const dayFactor = relHours ** dayAlpha

			const landAlpha = 0.08 + 0.37 * Math.E ** (-rain / 85)
			const landFactor = Math.min(1, 1 - Math.E ** (-distKm / 900))

			dtr_monthly[idx] =
				rainFactor * dayFactor * (1 + landFactor * landAlpha) * daylightFactor
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
