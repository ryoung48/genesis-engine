import type { LocalSolarState } from "@/model/climate/weather/local/clock/types"
export interface WeatherInputs {
	temperatureC: number
	temperatureNormalC: number
	monthlyTemperatureC: number
	dewPointC: number | null
	windU: number
	windV: number
	windSpeedMs: number
	gustMs: number
	cloudMean: number | null
	meanRateMmH: number
	monthlyRainMm: number
	dtrC: number | null
	solar: LocalSolarState
	convectiveBias: number
	surfaceC: number
	clearSurfaceC: number
	stormTrack: number
	pressureTendencyHpa: number
	cyclone: number
	branchDraw: number
	eventDraw: number
	precipitationDraw: number
	gustDraw: number
	layerDraw: number
}
export interface WeatherWindVectorParams {
	u: number
	v: number
	speedMs: number
}
