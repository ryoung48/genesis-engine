import type { OrogenParams, OrogenRainfall } from ".."

/**
 * Compute per-cell per-month diurnal temperature range (deg C) for use as the
 * td parameter in the Hargreaves-Samani PET formula.
 *
 * Drivers:
 *   - rotFactor: slower rotation -> longer day/night -> larger swing
 *   - pressureFactor: thinner atmosphere -> less thermal buffering -> larger swing
 *   - oceanFactor: continental interiors have larger DTR than coasts
 *   - elevBoost: higher altitude -> thinner atmospheric column -> flat +deg C/km term
 *   - rainFactor: cloud cover proxy; more rain reduces DTR; capped at 1.5x
 *   - polarFactor: reduces DTR when daylight deviates from half the planet day
 *
 * @param rainfall monthly rainfall (mm), shape [12 * N]
 * @param elevationKm actual elevation in km (positive = above sea level)
 * @param oceanDist distance from nearest ocean in km; undefined means coastal
 * @param isLand land mask
 * @param params optional planet params (hoursPerDay, pressure, tidallyLocked)
 * @param daylight_hours_monthly hours of daylight per day, shape [12 * N]
 * @returns Object with `monthly` Float32Array of shape [12 * N] and `annual`
 *   Float32Array of shape [N], both in deg C
 */
export function computeDiurnalRange(
	rainfall: OrogenRainfall,
	_elevationKm: Float32Array,
	oceanDist: Float32Array | undefined,
	isLand: Uint8Array,
	params?: Pick<OrogenParams, "hoursPerDay" | "pressure" | "tidallyLocked">,
	daylight_hours_monthly?: Float32Array,
): { monthly: Float32Array; annual: Float32Array } {
	const N = isLand.length
	const dtr_monthly = new Float32Array(12 * N)
	const relHours = params?.hoursPerDay / 24
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
