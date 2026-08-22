import { CLOUD_COVER } from "@/model/climate/precipitation/cloud-cover"
import type { CloudCoverTemperatureModifierParams } from "@/model/climate/temperature/cloud-cover-modifier/types"
import { MATH } from "@/model/shared/math/core"

const HOT_LOW_CLOUD_WARMING_C = 10
const HOT_HIGH_CLOUD_COOLING_C = 5
const INTENSITY_CAP_TEMP_C = 20

/**
 * Cloud cover damps or amplifies monthly temperature: clear skies push a
 * warm region hotter and a cold region colder, while overcast skies do the
 * opposite. Sign and effect strength are both driven by the region's
 * *annual average* temperature (not the individual month's), scaling
 * linearly with distance from 0°C, reaching its cap at |avg temp| >= 25°C
 * and vanishing at avg temp === 0. Uses modeled (procedural) temperature
 * only, never earth-observed.
 */
function applyCloudCoverTemperatureModifier({
	climate,
	rainfall,
	hydrology,
	dtrMonthly,
	oceanDist,
}: CloudCoverTemperatureModifierParams): void {
	const N = oceanDist.length
	for (let r = 0; r < N; r++) {
		const annualTempC = climate.temperature_avg[r]
		if (annualTempC === 0) continue

		const intensity = Math.min(1, Math.abs(annualTempC) / INTENSITY_CAP_TEMP_C)
		if (intensity === 0) continue

		const oceanDistanceKm = oceanDist[r]
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
			})
			// +1 (max warming) at <=20% cloud cover (clear), -1 (max cooling) at
			// >=80% cloud cover (overcast), linear ramp between.
			const clearness = MATH.piecewise({
				domain: [0.2, 0.8],
				range: [1, -1],
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
		annualDelta /= 12
		climate.temperature_avg[r] += annualDelta
		climate.temperature_min[r] += minDelta
		climate.temperature_max[r] += maxDelta
	}
}

export const CLOUD_COVER_TEMPERATURE_MODIFIER = {
	applyCloudCoverTemperatureModifier,
}
