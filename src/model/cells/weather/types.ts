import { Climate } from "../types"
import { Cell } from "../types"

export type TimeOfDay = "dawn" | "morning" | "afternoon" | "dusk" | "night"

export type TemperatureVariance = "warmer" | "colder" | "normal"

export type WeatherConditions =
	| "clear"
	| "cloudy"
	| "fog"
	| "rainy"
	| "stormy"
	| "overcast"
	| "windy"

export type CloudTypes =
	| "clear skies"
	| "haze"
	| "cirrus clouds"
	| "altostratus clouds"
	| "stratus clouds"
	| "altocumulus clouds"
	| "cumulus clouds"
	| "nimbus clouds"

export interface WeatherParams {
	rain: number
	temp: number
	clouds: CloudTypes
	climate: Climate
}

export interface WeatherPhenomena {
	wind: number
	weather:
		| "clear skies"
		| "cloudy"
		| "dew"
		| "thin mist"
		| "mist"
		| "fog"
		| "drizzle"
		| "spattering rain"
		| "pelting rain"
		| "rain shower"
		| "thunderstorm"
		| "quiet downpour"
		| "sleet"
		| "cold surface"
		| "thin frost"
		| "frost"
		| "rime"
		| "ice fog"
		| "dusting"
		| "tiny flakes"
		| "ice crystals"
		| "snow flurry"
		| "snowfall"
		| "blizzard"
		| "sand storm"
		| "dust storm"
}

export type WeatherConditionsParams = {
	cell: Cell
	month?: number
	color?: string
}
