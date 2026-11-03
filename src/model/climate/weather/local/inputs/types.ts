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
	afternoon: boolean
	surfaceC: number
	clearSurfaceC: number
	branchDraw: number
	eventDraw: number
	precipitationDraw: number
}
