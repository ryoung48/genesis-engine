import type {
	OceanSeaIce,
	OceanWaveField,
} from "@/model/climate/ocean/waves/types"
import type { LocalWeatherValues } from "@/model/climate/weather/local/types"

export type MarineSeaState =
	| "calm"
	| "smooth"
	| "slight"
	| "moderate"
	| "rough"
	| "veryRough"
	| "high"
	| "veryHigh"
	| "phenomenal"
	| "iceCovered"

export interface MarineWaves {
	heightM: number
	state: MarineSeaState
	fromDeg: number | null
	fetchKm: number
}

export interface MarineWavesParams {
	field: OceanWaveField
	sea: number
	ice: OceanSeaIce
	values: Pick<
		LocalWeatherValues,
		| "windU"
		| "windV"
		| "windSpeedMs"
		| "windDirectionDeg"
		| "temperatureNormalC"
	>
}
