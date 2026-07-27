import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisRainfall,
} from "@/model/types/climate"
import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisParams } from "@/model/types/tectonics"

export interface ComputeRiversParams {
	mesh: SphereMesh
	elevation: Float32Array
	rainfall: GenesisRainfall
	climate: GenesisClimate
	hydrology: GenesisHydrology
	isLand: Uint8Array
	params?: Pick<GenesisParams, "planetRadiusKm" | "daysPerYear" | "hoursPerDay">
}

export interface PolylineLengthKmParams {
	line: [number, number, number, number][]
	radiusKm: number
}
