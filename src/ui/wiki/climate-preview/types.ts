import type { TidalSchedule } from "@/model/climate/ocean/tides/tidal-schedule/types"

export interface EbmPreviewConfig {
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	// [JUSTIFICATION] The stellar editor may already hold measured host values;
	// otherwise class/subtype drive the lookup.
	starTemperatureK?: number
	// [JUSTIFICATION] See starTemperatureK.
	starDiameterSol?: number
	orbitalDistanceAU: number
	hoursPerDay: number
	daysPerYear: number
	landFraction: number
	radius: number
	pressure: number
}

export interface RegularPreviewConfigInput {
	obliquity: number
	eccentricity: number
	perihelion: number
	spectralClass: string
	starSubtype: number
	// [JUSTIFICATION] See EbmPreviewConfig.starTemperatureK.
	starTemperatureK?: number
	// [JUSTIFICATION] See EbmPreviewConfig.starDiameterSol.
	starDiameterSol?: number
	orbitalDistanceAU: number
	hoursPerDay: number
	daysPerYear: number
	landFraction: number
	planetRadiusKm: number
	pressureBar: number
}

export interface HeatmapTooltipParams {
	rowValue: number
	columnValue: number
	value: number
	rowIndex: number
	columnIndex: number
}

interface ClimatePreviewCommon {
	avgTemp: number
	insolation: number[][]
	insolColorFn: (value: number) => string
	daylight: number[][]
	daylightColorFn: (value: number) => string
	columnValues: number[]
	columnLabels: string[]
	// [JUSTIFICATION] Only the regular model has a tidal schedule to overlay.
	tidalSchedule?: TidalSchedule
}

export interface RegularClimatePreviewData extends ClimatePreviewCommon {
	heat: number[][]
	lats: number[]
	iceMassBalance: number[][]
	iceBalanceColorFn: (value: number) => string
	converged: boolean
	yearsRun: number
}

export interface LockedClimatePreviewData extends ClimatePreviewCommon {
	heat: number[][]
	longitudes: number[]
}

export type ClimatePreviewData =
	| RegularClimatePreviewData
	| LockedClimatePreviewData
