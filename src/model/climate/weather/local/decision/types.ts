import type { WeatherParticleSource } from "@/model/climate/weather/local/baseline/types"
import type {
	WeatherCloudDescription,
	WeatherPhenomenon,
} from "@/model/climate/weather/local/vocabulary/types"
export type WeatherSystem =
	| "clear"
	| "cloudy"
	| "overcast"
	| "fog"
	| "rainy"
	| "stormy"
	| "windy"
export type WeatherRegime = "stormy" | "rainy" | "overcast" | "cloudy" | "clear"
export interface WeatherDecisionInputs {
	rainChance: number
	meanRateMmH: number
	cloudMean: number | null
	temperatureC: number
	monthlyTemperatureC: number
	dewPointC: number | null
	surfaceC: number
	clearSurfaceC: number
	windSpeedMs: number
	gustMs: number
	afternoon: boolean
	daylight: boolean
	particleSource: WeatherParticleSource | null
	aridity: number
}
export interface WeatherOutcome {
	kind: WeatherPhenomenon
	weight: number
	water: number
}
export interface WeatherBranch {
	system: WeatherSystem
	wetBranch: boolean
	cloud: WeatherCloudDescription
	weight: number
	cover: number
	outcomes: WeatherOutcome[]
}
export interface WeatherChoices {
	branches: WeatherBranch[]
	expectedWater: number
	wetProbability: number
	acceptance: number
	wetRateMmH: number
	input: WeatherDecisionInputs
}
export interface WeatherDraws {
	branch: number
	event: number
	precipitation: number
}
export interface ResolveWeatherParams {
	choices: WeatherChoices
	draws: WeatherDraws
}
export interface WeatherDecision {
	system: WeatherSystem
	cloud: WeatherCloudDescription
	kind: WeatherPhenomenon
	rainRateMmH: number
	cloudCover: number | null
}
export interface WeatherCloudChoiceParams {
	system: WeatherRegime
	rainChance: number
}
export interface WeatherOutcomeParams {
	system: WeatherSystem
	cloud: WeatherCloudDescription
	input: WeatherDecisionInputs
}
export interface WeatherConstraintParams {
	kind: WeatherPhenomenon
	input: WeatherDecisionInputs
	quiet: WeatherPhenomenon
}
export interface WeightedWeatherEntry {
	weight: number
}
export interface SelectWeatherParams<T extends WeightedWeatherEntry> {
	entries: T[]
	draw: number
}
export interface WeatherCondensationParams {
	input: WeatherDecisionInputs
	radiative: boolean
}
export interface WeatherDryShareParams {
	cloudMean: number | null
	wet: number
	wetCover: number
	overcastCover: number
}
export interface WeatherDryShares {
	clear: number
	overcast: number
	cloudy: number
	wetScale: number
	dryScale: number
}
