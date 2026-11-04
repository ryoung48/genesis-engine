import type { UnitSystem } from "@/ui/genesis/shared/ui-format"

export interface FormatWeatherValueParams {
	value: number
	unitSystem: UnitSystem
}

export interface FormatLatLonParams {
	latitude: number
	longitude: number
}
