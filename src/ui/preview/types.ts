import type { TidalSchedule } from "@/model/climate/tidal-schedule"

interface ClimatePreviewCommon {
	avgTemp: number
	insolation: number[][]
	insolColorFn: (value: number) => string
	daylight: number[][]
	daylightColorFn: (value: number) => string
	columnValues: number[]
	columnLabels: string[]
	tidalSchedule?: TidalSchedule
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
