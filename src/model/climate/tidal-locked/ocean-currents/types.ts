import type {
	GenesisClimate,
	GenesisOceanCurrents,
} from "@/model/climate/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type LockedCurrentParams = Pick<
	Partial<GenesisParams>,
	| "substellarLon"
	| "eccentricity"
	| "obliquity"
	| "perihelion"
	| "planetRadiusKm"
>

export type ComputeLockedOceanCurrentsParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	landmarks: GenesisLandmarks
	params?: Partial<GenesisParams>
}

export type ApplyLockedCurrentTemperatureEffectParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	currents: GenesisOceanCurrents
	params?: Partial<GenesisParams>
}

export type BuildLockedOceanCurrentGridParams = {
	mesh: SphereMesh
	oceanWarmth: Float32Array
	isLand: Uint8Array
	latDeg: Float32Array
	lonDeg: Float32Array
	params?: Pick<
		GenesisParams,
		"substellarLon" | "eccentricity" | "obliquity" | "perihelion"
	>
	currentMonth?: number
}
