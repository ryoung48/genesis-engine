import type { GenesisClimate } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type ComputeTidalRainParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	params?: Pick<
		GenesisParams,
		| "seed"
		| "substellarLon"
		| "obliquity"
		| "pressure"
		| "eccentricity"
		| "perihelion"
		| "planetRadiusKm"
	>
	distCoast?: Float32Array
}
