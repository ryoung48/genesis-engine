import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisClimate } from "@/model/types/climate"
import type { GenesisParams } from "@/model/types/tectonics"
import type { WindSurface } from "@/model/climate/wind/types"

export type ComputeLockedWindVectorsParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	elevation_km: Float32Array
	params?: Pick<
		GenesisParams,
		"substellarLon" | "obliquity" | "eccentricity" | "perihelion" | "pressure"
	>
	month?: number
	surface?: WindSurface
}
