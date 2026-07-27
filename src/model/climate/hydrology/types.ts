import type { GenesisClimate, GenesisRainfall } from "@/model/climate/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type FillPetMonthlyHargreavesParams = {
	temperatureMonthly: Float32Array
	rangeMonthly: Float32Array
	insolationMonthly: Float32Array
	petMonthly: Float32Array
	dpm: number
}

export type RefreshClimatePetMonthlyParams = {
	climate: Pick<
		GenesisClimate,
		| "temperature_monthly"
		| "temperature_monthly_range"
		| "insolation_monthly"
		| "pet_monthly"
	>
	/** Optional day-count conversion used when deriving monthly PET. */
	params?: Pick<GenesisParams, "daysPerYear">
}

export type ComputeAetFromPetParams = {
	rain: Float64Array
	petBuf: Float64Array
	aetBuf: Float64Array
}

export type ComputeHydrologyFieldsParams = {
	climate: Pick<GenesisClimate, "pet_monthly">
	rainfall: Pick<GenesisRainfall, "monthly">
	isLand: Uint8Array
}
