import type { DiurnalRangeCellsParams } from "@/model/climate/temperature/dtr/types"
import type { GenesisRainfall } from "@/model/climate/types"
import type { GenesisParams } from "@/model/pipelines/types"
import { PARALLEL } from "@/model/shared/parallel"
import { TIME } from "@/model/shared/time"

function computeDiurnalRange(args: {
	rainfall: GenesisRainfall
	oceanDist: Float32Array | undefined
	isLand: Uint8Array
	params?: Pick<GenesisParams, "hoursPerDay">
	daylight_hours_monthly?: Float32Array
}): { monthly: Float32Array; annual: Float32Array } {
	const { rainfall, oceanDist, isLand, params, daylight_hours_monthly } = args

	const N = isLand.length
	const monthly = PARALLEL.shared(new Float32Array(12 * N))
	const annual = PARALLEL.shared(new Float32Array(N))
	PARALLEL.mapCells({
		task: "diurnalRangeCells",
		kernel: diurnalRangeCells,
		count: N,
		payload: {
			isLand: PARALLEL.shared(isLand),
			rainMonthly: PARALLEL.shared(rainfall.monthly),
			oceanDist: oceanDist ? PARALLEL.shared(oceanDist) : null,
			daylightHoursMonthly: PARALLEL.shared(daylight_hours_monthly),
			hoursPerDay: params?.hoursPerDay,
			monthly,
			annual,
		},
	})
	return { monthly: PARALLEL.local(monthly), annual: PARALLEL.local(annual) }
}

function diurnalRangeCells({
	start,
	end,
	isLand,
	rainMonthly,
	oceanDist,
	daylightHoursMonthly,
	hoursPerDay,
	monthly,
	annual,
}: DiurnalRangeCellsParams): void {
	const N = isLand.length
	const relHours = hoursPerDay / TIME.hoursPerDay
	const oceanRain = 300
	const oceanDaylightWet = 1 - Math.E ** (-oceanRain / 100)
	const oceanDaylightAmp = 0.6 * (1 - 0.5 * oceanDaylightWet)
	const oceanHourFactor = 3 * relHours ** 0.55
	for (let r = start; r < end; r++) {
		if (!isLand[r]) {
			for (let m = 0; m < 12; m++) {
				const idx = m * N + r
				const dayFrac = daylightHoursMonthly[idx] / hoursPerDay
				const daylightFactor = 1 - oceanDaylightAmp * (2 * dayFrac - 1) ** 2
				const oceanVariability = oceanHourFactor * daylightFactor
				monthly[idx] = 4 + oceanVariability
			}
		} else {
			const distKm = oceanDist ? oceanDist[r] : 0
			const landFactor = Math.min(1, 1 - Math.E ** (-distKm / 1200))

			for (let m = 0; m < 12; m++) {
				const idx = m * N + r
				const rain = rainMonthly[idx]
				const dayFrac = daylightHoursMonthly[idx] / hoursPerDay
				const daylightWet = 1 - Math.E ** (-rain / 100)
				const daylightAmp = 0.6 * (1 - 0.5 * daylightWet)
				const daylightFactor = 1 - daylightAmp * (2 * dayFrac - 1) ** 2
				const rainDecay = Math.E ** (-rain / 85)
				const rainVariability = 8.5 * rainDecay
				const dayAlpha = 0.2 + 0.23 * Math.E ** (-rain / 90)
				const dayFactor = relHours ** dayAlpha

				const landAlpha = 0.08 + 0.37 * rainDecay

				monthly[idx] =
					5 +
					rainVariability *
						dayFactor *
						(1 + landFactor * landAlpha) *
						daylightFactor
			}
		}
		let sum = 0
		for (let m = 0; m < 12; m++) sum += monthly[m * N + r]
		annual[r] = sum / 12
	}
}

export const DTR = {
	computeDiurnalRange,
	diurnalRangeCells,
}
