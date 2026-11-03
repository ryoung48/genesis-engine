export interface RelativeHumidityParams {
	temperatureC: number
	dewPointC: number | null
}

export interface ApparentTemperatureParams {
	temperatureC: number
	relativeHumidity: number | null
	windSpeedMs: number
}

export interface HeatIndexParams {
	t: number
	rh: number
}
