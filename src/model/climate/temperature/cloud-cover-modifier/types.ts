import type { GenesisClimate } from "@/model/climate/types"
import type { CellRange } from "@/model/shared/parallel/types"

export interface CloudCoverTemperatureModifierParams {
	climate: Pick<
		GenesisClimate,
		| "temperature_monthly"
		| "temperature_avg"
		| "temperature_min"
		| "temperature_max"
		| "pet_monthly"
		| "cloud_cover_monthly"
	>
	rainfall: {
		monthly: Float32Array
	}
	hydrology: {
		aet_monthly: Float32Array
	}
	dtrMonthly: Float32Array
	oceanDist: Float32Array
	isLand: Uint8Array
	// [JUSTIFICATION] Ordinary rotating worlds use the default cloud estimator.
	isTidallyLocked?: boolean
}

export interface CloudCoverCellsParams extends CellRange {
	temperatureMonthly: Float32Array
	temperatureAvg: Float32Array
	temperatureMin: Float32Array
	temperatureMax: Float32Array
	cloudCoverMonthly: Float32Array
	petMonthly: Float32Array
	aetMonthly: Float32Array
	rainMonthly: Float32Array
	dtrMonthly: Float32Array
	oceanDist: Float32Array
	isLand: Uint8Array
	// [JUSTIFICATION] Ordinary rotating worlds use the default cloud estimator.
	isTidallyLocked?: boolean
}
