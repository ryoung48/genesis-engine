import type { GenesisObservedCurrent } from "@/model/climate/observed-earth/types"
import type { MonthlyOceanWind } from "@/model/climate/ocean/currents/circulation/types"
import type {
	GenesisClimate,
	GenesisOceanCurrents,
} from "@/model/climate/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type ComputeSSTParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	landmarks: GenesisLandmarks
	climate: GenesisClimate
	elevation_km: Float32Array
	params: GenesisParams
	wind: MonthlyOceanWind | null
}

export type ApplySSTToClimateParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	oceanCurrents: GenesisOceanCurrents
}

export type BuildOceanCurrentGridParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	oceanCurrents: GenesisOceanCurrents
	month: number | undefined
}

export type ObservedOceanCurrentGridParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	observedCurrent: GenesisObservedCurrent | undefined
	month: number | undefined
}

export type CurrentDisplayInput = {
	mesh: SphereMesh
	isLand: Uint8Array
	u: Float32Array | undefined
	v: Float32Array | undefined
	scalar: Float32Array | undefined
	ocean: Uint8Array | undefined
	month: number | undefined
}
