import type { GenesisClimate, GenesisRainfall } from "@/model/climate/types"

export interface ClassifyHabitabilityParams {
	climate: Pick<GenesisClimate, "temperature_monthly" | "pet_monthly">
	rainfall: Pick<GenesisRainfall, "annual">
	dtrMonthly: Float32Array
	oceanDist: Float32Array
	isLand: Uint8Array
	pressureBar: number
	numRegions: number
}

export interface HabitabilityMasks {
	uninhabitable: Uint8Array
	hyperArid: Uint8Array
}

export interface CellMonth {
	temperatureC: ArrayLike<number>
	dtrC: ArrayLike<number>
}

export interface HeatLethalParams extends CellMonth {
	pressureKpa: number
	annualAridity: number
	annualRainMm: number
	distFromOceanKm: number
}

export interface HasLiquidWaterParams {
	temperatureC: ArrayLike<number>
	boilingC: number
}

export interface WetBulbParams {
	tempC: number
	vaporPressureKpa: number
	pressureKpa: number
}

export interface BoilingPointParams {
	pressureBar: number
}
