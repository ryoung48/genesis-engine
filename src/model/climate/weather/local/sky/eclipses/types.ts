import type {
	EclipseKind,
	EclipseStatus,
	PlanetEclipse,
} from "@/model/celestial/eclipses/types"
import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"
import type { GenesisParams } from "@/model/pipelines/types"
import type { ScanInterval } from "@/model/shared/math/scan/types"

export interface WeatherEclipseCalendarParams {
	params: GenesisParams
	startS: number
	endS: number
}
export interface WeatherEclipseNextParams {
	params: GenesisParams
	startS: number
}
export interface WeatherEclipseNext {
	status: EclipseStatus
	event: PlanetEclipse | null
}
export interface WeatherEclipseLocalParams {
	params: GenesisParams
	xyz: [number, number, number]
	instant: WeatherInstant
}
export interface LocalCircumstances {
	kind: EclipseKind
	visibleIntervals: ScanInterval[]
	maximumS: number
	coverage: number | null
	localHour: number | null
}
export interface LocalEclipse extends PlanetEclipse {
	visibleIntervals: ScanInterval[]
	durationS: number
	coverage: number | null
	instantaneousCoverage: number | null
	localHour: number | null
	dayOffset: number
	durationClipped: boolean
}
export interface CombinedCircumstances {
	maximumS: number
	coverage: number
	total: boolean
	localHour: number | null
}
export interface CombinedEclipse extends CombinedCircumstances {
	current: boolean
	moonLabels: string[]
	instantaneousCoverage: number | null
	dayOffset: number
}
export interface WeatherEclipseLocalResult {
	next: LocalEclipse[]
	current: LocalEclipse[]
	combined: CombinedEclipse[]
	unavailable: string[]
	status: EclipseStatus
}
