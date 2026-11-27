import type { GenesisClimate } from "@/model/climate/types"
import type { SeabedHabitat } from "@/model/geography/terrain/seabed/habitat/types"
import type { ShoreMaterial } from "@/model/geography/terrain/shore/material/types"
import type { ShoreLayers } from "@/model/geography/terrain/shore/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface SeabedLayers {
	substrate: Uint8Array
	habitat: Uint8Array
	share: Uint8Array
}

export interface SeabedStats {
	oceanCells: number
	reachedCells: number
	habitat: Record<SeabedHabitat, number>
	substrate: Record<ShoreMaterial, number>
	stageMs: number
}

export interface SeabedComputeParams {
	mesh: SphereMesh
	isLand: Uint8Array
	openWater: Uint8Array
	elevationKm: Float32Array
	planetRadiusKm: number
	flow: Float32Array
	shore: Pick<ShoreLayers, "material" | "exposureLeeM">
	climate: Pick<GenesisClimate, "temperature_monthly">
	iceMinMonthly: Float32Array
	iceMaxMonthly: Float32Array
}

export interface SeabedResult {
	layers: SeabedLayers
	stats: SeabedStats
}

export interface SeabedStatsParams {
	layers: SeabedLayers
	openWater: Uint8Array
	stageMs: number
}
