import type {
	EclipseVector,
	PlanetEclipse,
} from "@/model/celestial/eclipses/types"
import type { WeatherEclipseCache } from "@/model/climate/weather/local/sky/eclipses/forecast/types"
import type { LocalEclipse } from "@/model/climate/weather/local/sky/eclipses/types"

export interface EclipseLocalPointParams {
	cache: WeatherEclipseCache
	xyz: [number, number, number]
	event: PlanetEclipse
	seconds: number
}
export interface EclipseLocalEventParams {
	cache: WeatherEclipseCache
	xyz: [number, number, number]
	event: PlanetEclipse
}
export interface EclipseLocalUnionParams {
	cache: WeatherEclipseCache
	xyz: [number, number, number]
	moonIdxs: number[]
	seconds: number
}
export interface EclipseLocalStateParams {
	cache: WeatherEclipseCache
	idx: number
}
export interface EclipseLocalFrameParams {
	cache: WeatherEclipseCache
	seconds: number
}
export interface EclipseAltitudeParams {
	body: EclipseVector
	observer: EclipseVector
	xyz: EclipseVector
}
export interface EclipseCombineParams {
	cache: WeatherEclipseCache
	xyz: [number, number, number]
	events: LocalEclipse[]
}
