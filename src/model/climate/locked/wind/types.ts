import type { WindSurface } from "@/model/climate/wind/types"
import type { GenesisClimate } from "@/model/types/climate"
import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisParams } from "@/model/types/tectonics"

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
