export interface CloudCoverTemperatureModifierParams {
	climate: {
		temperature_monthly: Float32Array
		temperature_avg: Float32Array
		temperature_min: Float32Array
		temperature_max: Float32Array
		pet_monthly: Float32Array
	}
	rainfall: {
		monthly: Float32Array
	}
	hydrology: {
		aet_monthly: Float32Array
	}
	dtrMonthly: Float32Array
	oceanDist: Float32Array
}
