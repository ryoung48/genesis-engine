import type { TidalSchedule } from "@/model/climate/ocean/tides/tidal-schedule/types"

interface ClimatePreviewCommon {
	insolation: number[][]
	insolColorFn: (value: number) => string
	daylight: number[][]
	daylightColorFn: (value: number) => string
	columnValues: number[]
	columnLabels: string[]
	tidalSchedule?: TidalSchedule
}

export interface RegularClimatePreviewData extends ClimatePreviewCommon {
	lats: number[]
}

export interface LockedClimatePreviewData extends ClimatePreviewCommon {
	avgTemp: number
	heat: number[][]
	longitudes: number[]
}

export type ClimatePreviewData =
	| RegularClimatePreviewData
	| LockedClimatePreviewData

export interface SunlightPreviewConfig {
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	// [JUSTIFICATION] A rolled galaxy star supplies its own; an authored one is looked up by class and subtype.
	starTemperatureK?: number
	// [JUSTIFICATION] As starTemperatureK.
	starDiameterSol?: number
	orbitalDistanceAU: number
	hoursPerDay: number
}

export interface LockedAvgTempConfig {
	isSolarLocked: boolean
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	// [JUSTIFICATION] As SunlightPreviewConfig.starTemperatureK.
	starTemperatureK?: number
	// [JUSTIFICATION] As SunlightPreviewConfig.starTemperatureK.
	starDiameterSol?: number
	orbitalDistanceAU: number
	hoursPerDay: number
	daysPerYear: number
	planetRadiusKm: number
	pressureBar: number
	// [JUSTIFICATION] Gas giants and bodies without a seismology profile have no tidal heating.
	seismologyTotalHeatingK?: number
	substellarLon: number
}
