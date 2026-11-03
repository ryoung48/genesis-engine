import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"
import type { WeatherOutlook } from "@/model/climate/weather/local/outlook/types"
import type {
	LocalWeatherResponse,
	WeatherSnapshot,
} from "@/model/climate/weather/local/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface CreateWeatherClientParams {
	world: SerializedGenesisWorld
	revision: number
	representatives: Map<number, [number, number]>
}

export interface WeatherClientQuery {
	instant: WeatherInstant
	province: number
}

export interface WeatherClient {
	request: (query: WeatherClientQuery) => Promise<LocalWeatherResponse>
	dispose: () => void
}

export interface PendingWeatherRequest {
	resolve: (value: LocalWeatherResponse) => void
	reject: (reason: Error) => void
}

export interface UseLocalWeatherParams {
	world: SerializedGenesisWorld | null
	instant: WeatherInstant | null
	selectedProvince: number | null
	representatives: Map<number, [number, number]>
}

export interface LocalWeatherDisplayState {
	world: SerializedGenesisWorld | null
	seconds: number | null
	selected: WeatherSnapshot | null
	outlook: WeatherOutlook | null
	loading: boolean
	error: string | null
}
