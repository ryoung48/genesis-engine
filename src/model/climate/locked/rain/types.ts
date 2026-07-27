import type { GenesisClimate } from "@/model/types/climate"
import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisParams } from "@/model/types/tectonics"

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
