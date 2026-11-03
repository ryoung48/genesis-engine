import type { WeatherConditionParams } from "@/ui/bench/weather/types"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
export interface WeatherEnvironmentParams extends WeatherConditionParams {
	unitSystem: UnitSystem
}
export interface WeatherCloudTableParams extends WeatherEnvironmentParams {
	scope: "overall" | "condition"
}
export interface WeatherBandRangeParams {
	minimum: number | null
	maximum: number | null
	dimension: "wind" | "temperature"
	unitSystem: UnitSystem
}
export interface WeatherBandTableParams extends WeatherEnvironmentParams {
	dimension: "wind" | "temperature"
}
