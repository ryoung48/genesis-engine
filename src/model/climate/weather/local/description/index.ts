import type {
	WeatherDeparture,
	WeatherDepartureParams,
	WeatherDescriptionBand,
	WeatherSky,
} from "@/model/climate/weather/local/description/types"

const temperatureWords = [
	[-40, "Frozen"],
	[-30, "Glacial"],
	[-20, "Bitterly cold"],
	[-10, "Very cold"],
	[0, "Cold"],
	[10, "Wintry"],
	[20, "Icy"],
	[30, "Frosty"],
	[40, "Chilly"],
	[50, "Brisk"],
	[60, "Cool"],
	[70, "Mild"],
	[80, "Warm"],
	[90, "Balmy"],
	[100, "Sweaty"],
	[110, "Sweltering"],
	[120, "Feverish"],
	[130, "Baking"],
] as const

const windWords = [
	[0.3, "Calm"],
	[1.6, "Light air"],
	[3.4, "Light breeze"],
	[5.5, "Gentle breeze"],
	[8, "Moderate breeze"],
	[10.8, "Fresh breeze"],
	[13.9, "Strong breeze"],
	[17.2, "Near gale"],
	[20.8, "Gale"],
	[24.5, "Strong gale"],
	[28.5, "Storm-force wind"],
	[32.7, "Violent storm-force wind"],
] as const

const skyLabels: Record<WeatherSky, string> = {
	clear: "Clear",
	mostlyClear: "Mostly clear",
	partlyCloudy: "Partly cloudy",
	mostlyCloudy: "Mostly cloudy",
	overcast: "Overcast",
	unavailable: "Cloud data unavailable",
}
function temperature(celsius: number): string {
	return (
		temperatureWords.find(([f]) => celsius < ((f - 32) * 5) / 9)?.[1] ??
		"Scorching"
	)
}
function wind(speed: number): string {
	return (
		windWords.find(([limit]) => speed < limit)?.[1] ?? "Hurricane-force wind"
	)
}
function sky(coverage: number | null): WeatherSky {
	return coverage === null
		? "unavailable"
		: coverage === 0
			? "clear"
			: coverage <= 0.25
				? "mostlyClear"
				: coverage <= 0.5
					? "partlyCloudy"
					: coverage < 0.875
						? "mostlyCloudy"
						: "overcast"
}
function skyLabel(kind: WeatherSky): string {
	return skyLabels[kind]
}
function departure(values: WeatherDepartureParams): WeatherDeparture {
	const delta = values.temperatureC - values.temperatureNormalC
	return delta >= 40 / 9
		? "warmerThanUsual"
		: delta <= -40 / 9
			? "colderThanUsual"
			: "normal"
}
function temperatureBands(): WeatherDescriptionBand[] {
	return [
		...temperatureWords.map(([f, label], index) => ({
			label,
			minimum: index ? ((temperatureWords[index - 1][0] - 32) * 5) / 9 : null,
			maximum: ((f - 32) * 5) / 9,
		})),
		{ label: "Scorching", minimum: ((130 - 32) * 5) / 9, maximum: null },
	]
}
function windBands(): WeatherDescriptionBand[] {
	return [
		...windWords.map(([maximum, label], index) => ({
			label,
			minimum: index ? windWords[index - 1][0] : 0,
			maximum,
		})),
		{ label: "Hurricane-force wind", minimum: 32.7, maximum: null },
	]
}
function departureThresholdC(): number {
	return 40 / 9
}
export const WEATHER_DESCRIPTION = {
	temperature,
	wind,
	sky,
	skyLabel,
	departure,
	temperatureBands,
	windBands,
	departureThresholdC,
}
