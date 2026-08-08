import type { GenesisClimate } from "@/model/climate/types"
import type { WindSurface } from "@/model/climate/weather/wind/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

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
