import type { SerializedGenesisWorld } from "@/model/transport/types"
import type { ColorMode } from "@/ui/planet/colors"
import type { HoverInfo } from "@/ui/planet/hover/hover"

export interface GetHoverRainfallSeriesFromArraysParams {
	hoverInfo: HoverInfo | null
	world: SerializedGenesisWorld | null
	rainfallMonth: number
	annual: Float32Array | undefined
	monthly: Float32Array | undefined
}

export interface GetHoverDtrSeriesParams {
	hoverInfo: HoverInfo | null
	world: SerializedGenesisWorld | null
	dtrMonth: number
	annual: Float32Array | undefined
	monthlySource: Float32Array | undefined
}

export interface GetHoverMonthlySeriesParams {
	hoverInfo: HoverInfo | null
	world: SerializedGenesisWorld | null
	month: number
	annual: Float32Array | undefined
	monthly: Float32Array | undefined
}

export interface GetHoverMiseryParams {
	hoverInfo: HoverInfo | null
	world: SerializedGenesisWorld | null
	dtrMonth: number
	windSpeedMs: number | null
	monthlyWindSpeedMs: number[] | null
	useObserved: boolean
}

export interface GetHoverClimateDisplayParams {
	colorMode: ColorMode
	hoverPastaClimate: { code: string | null; name: string } | null
	hoverKoppenClimate: { code: string | null; name: string } | null
	hoverClimateZone: string | null
	hoverRealPastaClimate?: { code: string | null; name: string } | null
	hoverRealKoppenClimate?: { code: string | null; name: string } | null
}
