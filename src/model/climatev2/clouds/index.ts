import type {
	CloudEstimateParams,
	CloudFields,
} from "@/model/climatev2/clouds/types"
import { MATH } from "@/model/shared/math/core"

const MONTHS = 12
const SECONDS_PER_DAY = 86400
const MOISTURE_FLOOR = 0.2
const MOISTURE_SPAN = 0.6
const STABILITY_SCALE_K = 5
const CONVERGENCE_SCALE_PER_DAY = 0.5
const LOW_CLEAR_FRACTION = 0.3
const LOW_STABLE_FRACTION = 0.6
const CLOUD_RAIN_MM = 100
const LOW_ASCENT_FRACTION = 0.1
const STEFAN_BOLTZMANN = 5.670374419e-8
const LOW_CLOUD_TEMPERATURE_DROP_C = 10
const HIGH_CLOUD_TEMPERATURE_DROP_C = 50
const MIN_CLOUD_TEMPERATURE_K = 180

function estimate({
	ctx,
	winds,
	rainfall,
	yearScale,
	humidity,
	stability,
	temperatureMonthly,
}: CloudEstimateParams): CloudFields {
	const { grid, anchorMonths } = ctx
	const G = grid.size
	const K = anchorMonths.length
	const cover = new Float32Array(MONTHS * G)
	const low = new Float32Array(MONTHS * G)
	const high = new Float32Array(MONTHS * G)
	const lowThermalContrast = new Float32Array(MONTHS * G)
	const highThermalContrast = new Float32Array(MONTHS * G)
	for (let m = 0; m < MONTHS; m++) {
		const pos = (((m - anchorMonths[0]) * K) / MONTHS + K) % K
		const a = Math.floor(pos)
		const b = (a + 1) % K
		const f = pos - a
		for (let c = 0; c < G; c++) {
			const idx = m * G + c
			const rh = (1 - f) * humidity[a * G + c] + f * humidity[b * G + c]
			const stableK = (1 - f) * stability[a * G + c] + f * stability[b * G + c]
			const moisture = MATH.clamp01((rh - MOISTURE_FLOOR) / MOISTURE_SPAN)
			const stable = MATH.clamp01(stableK / STABILITY_SCALE_K)
			const ascent = MATH.clamp01(
				(winds.conv[idx] * SECONDS_PER_DAY) / CONVERGENCE_SCALE_PER_DAY,
			)
			low[idx] =
				moisture *
				(LOW_CLEAR_FRACTION +
					LOW_STABLE_FRACTION * stable +
					LOW_ASCENT_FRACTION * ascent)
			high[idx] =
				1 - Math.exp(-Math.max(0, rainfall[idx]) / yearScale / CLOUD_RAIN_MM)
			cover[idx] = 1 - (1 - low[idx]) * (1 - high[idx])
			const temperatureK = Math.max(
				MIN_CLOUD_TEMPERATURE_K,
				temperatureMonthly[idx] + 273.15,
			)
			const emitted = STEFAN_BOLTZMANN * temperatureK ** 4
			lowThermalContrast[idx] =
				emitted -
				STEFAN_BOLTZMANN *
					Math.max(
						MIN_CLOUD_TEMPERATURE_K,
						temperatureK - LOW_CLOUD_TEMPERATURE_DROP_C,
					) **
						4
			highThermalContrast[idx] =
				emitted -
				STEFAN_BOLTZMANN *
					Math.max(
						MIN_CLOUD_TEMPERATURE_K,
						temperatureK - HIGH_CLOUD_TEMPERATURE_DROP_C,
					) **
						4
		}
	}
	return { cover, low, high, lowThermalContrast, highThermalContrast }
}

export const CLIMATEV2_CLOUDS = { estimate }
