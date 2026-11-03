import type {
	WeatherCloudDescription,
	WeatherPhenomenon,
} from "@/model/climate/weather/local/vocabulary/types"
export type CloudGenus =
	| "cirrus"
	| "altostratus"
	| "altocumulus"
	| "stratus"
	| "nimbostratus"
	| "cumulus"
	| "cumulonimbus"

export interface CloudOccurrence {
	genus: CloudGenus
	cover: number
	layer: "low" | "middle" | "high" | "deep"
	estimated: true
}

export interface CategoryWeatherCloudsParams {
	category: WeatherCloudDescription | null
	cover: number | null
	phenomenon: WeatherPhenomenon
}
export interface EstimatedWeatherClouds {
	cover: number | null
	clouds: CloudOccurrence[] | null
}

export type WeatherCloudCategory = CloudGenus | "clear" | "unavailable"
export interface RepresentativeCloudParams {
	cloudCover: number | null
	clouds: CloudOccurrence[] | null
}
