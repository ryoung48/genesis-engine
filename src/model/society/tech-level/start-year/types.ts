import type {
	ProvinceGraph,
	WayOfLifeAtParams,
} from "@/model/society/farming/types"

export interface TimelineParams {
	farming: WayOfLifeAtParams["farming"]
	areaKm2: ArrayLike<number>
	graph: ProvinceGraph
	techLevel: number
}

export interface TimelineAtParams extends TimelineParams {
	year: number
}

export interface StartYearParams extends TimelineParams {
	horizonYear: number
}

export interface FirstYearParams {
	measure: (year: number) => number
	target: number
	from: number
	to: number
}

export interface TargetYearParams {
	farming: TimelineParams["farming"]
	areaKm2: TimelineParams["areaKm2"]
	graph: TimelineParams["graph"]
	horizonYear: number
	target: number
}
