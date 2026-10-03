import { CLOUD_COVER } from "@/model/climate/precipitation/cloud-cover"
import type {
	CloudCoverCellsParams,
	CloudCoverTemperatureModifierParams,
} from "@/model/climate/temperature/cloud-cover-modifier/types"
import { MATH } from "@/model/shared/math/core"
import { PARALLEL } from "@/model/shared/parallel"

const HOT_LOW_CLOUD_WARMING_C = 4
const HOT_HIGH_CLOUD_COOLING_C = 2.5
const INTENSITY_CAP_TEMP_C = 20
const CLEARNESS_CURVE = { domain: [0.2, 0.8], range: [1, -1] }

function applyCloudCoverTemperatureModifier({
	climate,
	rainfall,
	hydrology,
	dtrMonthly,
	oceanDist,
	isLand,
	isTidallyLocked,
}: CloudCoverTemperatureModifierParams): void {
	const N = oceanDist.length
	// Cached here (rather than left for hover/map to recompute on their own)
	// since this loop already visits every cell/month to estimate cloud
	// fraction for the temperature effect below -- see GenesisClimate's
	// cloud_cover_monthly doc.
	const cloudCoverMonthly = PARALLEL.shared(new Float32Array(N * 12))
	const temperatureMonthly = PARALLEL.shared(climate.temperature_monthly)
	const temperatureAvg = PARALLEL.shared(climate.temperature_avg)
	const temperatureMin = PARALLEL.shared(climate.temperature_min)
	const temperatureMax = PARALLEL.shared(climate.temperature_max)
	PARALLEL.mapCells({
		task: "cloudCoverCells",
		kernel: cloudCoverCells,
		count: N,
		payload: {
			temperatureMonthly,
			temperatureAvg,
			temperatureMin,
			temperatureMax,
			cloudCoverMonthly,
			petMonthly: PARALLEL.shared(climate.pet_monthly),
			aetMonthly: PARALLEL.shared(hydrology.aet_monthly),
			rainMonthly: PARALLEL.shared(rainfall.monthly),
			dtrMonthly: PARALLEL.shared(dtrMonthly),
			oceanDist: PARALLEL.shared(oceanDist),
			isLand: PARALLEL.shared(isLand),
			isTidallyLocked,
		},
	})
	climate.cloud_cover_monthly = PARALLEL.local(cloudCoverMonthly)
	climate.temperature_monthly.set(temperatureMonthly)
	climate.temperature_avg.set(temperatureAvg)
	climate.temperature_min.set(temperatureMin)
	climate.temperature_max.set(temperatureMax)
}

function cloudCoverCells({
	start,
	end,
	temperatureMonthly,
	temperatureAvg,
	temperatureMin,
	temperatureMax,
	cloudCoverMonthly,
	petMonthly,
	aetMonthly,
	rainMonthly,
	dtrMonthly,
	oceanDist,
	isLand,
	isTidallyLocked,
}: CloudCoverCellsParams): void {
	const N = oceanDist.length
	for (let r = start; r < end; r++) {
		const oceanDistanceKm = oceanDist[r]
		const annualTempC = temperatureAvg[r]
		const intensity = Math.min(1, Math.abs(annualTempC) / INTENSITY_CAP_TEMP_C)
		let annualDelta = 0
		let minDelta = 0
		let maxDelta = 0
		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			const cloudFraction = CLOUD_COVER.estimate({
				aetMm: aetMonthly[idx],
				petMm: petMonthly[idx],
				rainfallMm: rainMonthly[idx],
				dtrC: dtrMonthly[idx],
				temperatureC: temperatureMonthly[idx],
				oceanDistanceKm,
				isTidallyLocked,
			})
			cloudCoverMonthly[idx] = cloudFraction
			if (!isLand[r]) continue
			if (intensity === 0) continue

			// +1 (max warming) at <=20% cloud cover (clear), -1 (max cooling) at
			// >=80% cloud cover (overcast), linear ramp between.
			const clearness = MATH.piecewise({
				domain: CLEARNESS_CURVE.domain,
				range: CLEARNESS_CURVE.range,
				x: cloudFraction,
			})
			const hotSideDelta =
				clearness >= 0
					? clearness * HOT_LOW_CLOUD_WARMING_C
					: clearness * HOT_HIGH_CLOUD_COOLING_C
			const delta = annualTempC >= 0 ? hotSideDelta : -hotSideDelta

			const scaledDelta = delta * intensity

			temperatureMonthly[idx] += scaledDelta
			annualDelta += scaledDelta
			if (scaledDelta < minDelta) minDelta = scaledDelta
			if (scaledDelta > maxDelta) maxDelta = scaledDelta
		}
		if (intensity === 0) continue
		annualDelta /= 12
		temperatureAvg[r] += annualDelta
		temperatureMin[r] += minDelta
		temperatureMax[r] += maxDelta
	}
}

export const CLOUD_COVER_TEMPERATURE_MODIFIER = {
	applyCloudCoverTemperatureModifier,
	cloudCoverCells,
}
