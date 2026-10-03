import { CLOUD_COVER } from "@/model/climate/precipitation/cloud-cover"
import type { CloudCoverTemperatureModifierParams } from "@/model/climate/temperature/cloud-cover-modifier/types"
import { MATH } from "@/model/shared/math/core"

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
	const cloudCoverMonthly = new Float32Array(N * 12)
	climate.cloud_cover_monthly = cloudCoverMonthly

	for (let r = 0; r < N; r++) {
		const oceanDistanceKm = oceanDist[r]
		const annualTempC = climate.temperature_avg[r]
		const intensity = Math.min(1, Math.abs(annualTempC) / INTENSITY_CAP_TEMP_C)
		let annualDelta = 0
		let minDelta = 0
		let maxDelta = 0
		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			const cloudFraction = CLOUD_COVER.estimate({
				aetMm: hydrology.aet_monthly[idx],
				petMm: climate.pet_monthly[idx],
				rainfallMm: rainfall.monthly[idx],
				dtrC: dtrMonthly[idx],
				temperatureC: climate.temperature_monthly[idx],
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

			climate.temperature_monthly[idx] += scaledDelta
			annualDelta += scaledDelta
			if (scaledDelta < minDelta) minDelta = scaledDelta
			if (scaledDelta > maxDelta) maxDelta = scaledDelta
		}
		if (intensity === 0) continue
		annualDelta /= 12
		climate.temperature_avg[r] += annualDelta
		climate.temperature_min[r] += minDelta
		climate.temperature_max[r] += maxDelta
	}
}

export const CLOUD_COVER_TEMPERATURE_MODIFIER = {
	applyCloudCoverTemperatureModifier,
}
