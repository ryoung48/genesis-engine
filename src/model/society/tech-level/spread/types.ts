import type {
	FarmingResult,
	WayOfLifeField,
} from "@/model/society/farming/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface AssignTechLevelParams {
	provinces: Pick<
		GenesisProvinces,
		"count" | "desolate" | "adjOffset" | "adjList"
	>
	population: Float32Array
	development: Float32Array
	urbanPopulation: Float32Array
	sovereign: Int32Array
	farming: FarmingResult | null
	year: number
	techLevel: number
}

export interface SmoothRuralParams {
	provinces: Pick<GenesisProvinces, "adjOffset" | "adjList">
	levels: Float32Array
	settled: number[]
	urbanPopulation: Float32Array
}

export interface LeaderLevelParams {
	techLevel: number
}

export interface AverageLevelParams {
	target: number
}

export interface StretchParams {
	values: Float32Array
	settled: number[]
	techLevel: number
	leaders: number
	caps: Float32Array
}

export interface WayOfLifeCapsParams {
	provinces: Pick<GenesisProvinces, "desolate">
	// [JUSTIFICATION] Without farming data no province is capped.
	farming: FarmingResult | null
	// [JUSTIFICATION] Null exactly when farming is null.
	shares: WayOfLifeField | null
	sovereign: Int32Array
	urbanPopulation: Float32Array
}
