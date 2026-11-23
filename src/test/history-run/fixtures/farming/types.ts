import type { FarmingHearth } from "@/model/society/farming/hearths/types"
import type { ProvinceMeasures } from "@/model/society/farming/measures/types"
import type { SpreadParams } from "@/model/society/farming/spread/types"
import type { SeaLink } from "@/model/society/migration/sea-links/types"

export interface FarmingMeasuresParams {
	count: number
	overrides: Partial<{ [K in keyof ProvinceMeasures]: number }>
}

export interface FarmingWorldParams {
	layout: string
	stepDegrees: number
}

export interface SpreadCaseParams {
	layout: string
	stepDegrees: number
	hearths: FarmingHearth[]
	// [JUSTIFICATION] Cases that need uniform default climate omit overrides.
	measures?: FarmingMeasuresParams["overrides"]
	// [JUSTIFICATION] Cases that need no herd land keep the all-farm default.
	postMode?: number[]
	// [JUSTIFICATION] Cases that need no settlement wait keep the early default.
	continuousArrival?: number[]
	// [JUSTIFICATION] Only cases that edit the graph or the climate by hand pass a hook.
	configure?: (params: SpreadParams) => void
}

export interface WayCaseParams {
	suitability: number
	arid: number
	npp: number
	pasture: number
	forager: number
	// [JUSTIFICATION] Only valley cases have flood land.
	floodShare?: number
}

export interface HerdCaseParams {
	layout: string
	stepDegrees: number
	hearths: FarmingHearth[]
	knotYears: number[]
	// [JUSTIFICATION] Only the relay case names provinces that do not adopt herding.
	blocked?: number[]
	// [JUSTIFICATION] Only the direct-route case replaces the adjacent sea links.
	links?: SeaLink[][]
}
