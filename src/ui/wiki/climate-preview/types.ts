import type { TidalSchedule } from "@/model/climate/tidal-schedule/types"

interface ClimatePreviewCommon {
	avgTemp: number
	insolation: number[][]
	insolColorFn: (value: number) => string
	daylight: number[][]
	daylightColorFn: (value: number) => string
	columnValues: number[]
	columnLabels: string[]
	tidalSchedule?: TidalSchedule
	/** EBM inputs actually used for this preview -- unset for the tidally
	 * locked model, which doesn't have an equivalent greenhouse concept. */
	albedo?: number
	greenhouseFactor?: number
}

export interface RegularClimatePreviewData extends ClimatePreviewCommon {
	heat: number[][]
	lats: number[]
}

export interface LockedClimatePreviewData extends ClimatePreviewCommon {
	heat: number[][]
	longitudes: number[]
}

export type ClimatePreviewData =
	| RegularClimatePreviewData
	| LockedClimatePreviewData
