import type {
	StageContext,
	TemperatureStageResult,
} from "@/model/climatev2/vendor/core.js"

export interface LockedRainParams {
	ctx: StageContext
	temperature: TemperatureStageResult
}

export interface LockedRain {
	P: Float32Array
}

export interface NightSnowPoint {
	hours: number
	mmPerDay: number
}

export interface PotentialEvaporationParams {
	T: number
	net: number
	ps: number
}
