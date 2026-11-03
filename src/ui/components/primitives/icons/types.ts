import type React from "react"

export type WeatherIconName =
	| "weather-sunny"
	| "weather-night"
	| "weather-partly-cloudy"
	| "weather-night-partly-cloudy"
	| "weather-cloudy"
	| "weather-fog"
	| "weather-hazy"
	| "weather-rainy"
	| "weather-partly-rainy"
	| "weather-pouring"
	| "weather-lightning-rainy"
	| "weather-snowy-rainy"
	| "weather-snowy"
	| "weather-partly-snowy"
	| "weather-snowy-heavy"
	| "weather-dust"
	| "weather-windy"
	| "weather-sunset-up"
	| "weather-sunset-down"
	| "windsock"
	| "water"
	| "snowflake"
	| "snowflake-thermometer"
	| "thermometer"
	| "umbrella"
	| "cloud"
	| "sun-angle"

export interface WeatherIconProps extends React.SVGProps<SVGSVGElement> {
	name: WeatherIconName
}
