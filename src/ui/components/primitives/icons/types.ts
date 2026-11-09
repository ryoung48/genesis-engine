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
	| "flower"
	| "leaf-maple"
	| "weather-tornado"
	| "weather-windy"
	| "weather-sunset-up"
	| "weather-sunset-down"
	| "fire"
	| "water"
	| "snowflake"
	| "cloud"
	| "sun-angle"
	| "moon-new"
	| "moon-waxing-crescent"
	| "moon-first-quarter"
	| "moon-waxing-gibbous"
	| "moon-full"
	| "moon-waning-gibbous"
	| "moon-last-quarter"
	| "moon-waning-crescent"
	| "lunar-eclipse"
	| "solar-eclipse"
	| "weather-moonset-up"
	| "weather-moonset-down"
	| "waves"
	| "tide"
	| "arrow-up"
	| "arrow-down"

export interface WeatherIconProps extends React.SVGProps<SVGSVGElement> {
	name: WeatherIconName
}

export interface MoonIconPhase {
	illumination: number
	waxing: boolean
}

export interface MoonIconProps
	extends React.SVGProps<SVGSVGElement>,
		MoonIconPhase {}
