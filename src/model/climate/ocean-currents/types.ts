import type { GenesisLandmarks } from "@/model/terrain/landmarks/types"
import type {
	GenesisClimate,
	GenesisOceanCurrents,
} from "@/model/types/climate"
import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisParams } from "@/model/types/tectonics"

export interface OceanCurrentResult {
	/** Per-cell ocean warmth: -1 (cold) to +1 (warm). Zero for land. */
	oceanWarmth: Float32Array
	/** Per-cell diffused coastal warmth on land: -1..+1. Zero for ocean and deep interior. */
	coastalWarmth: Float32Array
	/** Optional flattened monthly ocean warmth, [month * N + r]. */
	oceanWarmthMonthly?: Float32Array
	/** Optional flattened monthly coastal warmth, [month * N + r]. */
	coastalWarmthMonthly?: Float32Array
	/** Optional flattened monthly temperature delta, [month * N + r]. */
	temperatureDeltaMonthly?: Float32Array
	/** Per-cell temperature delta applied by ocean currents (°C). Zero where no effect. */
	temperatureDelta: Float32Array
}

export interface CoastSite {
	region: number
	oceanNeighbors: number[]
	eastFacing: boolean
	lonBin: number
}

export type ComputeOceanCurrentsParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	distCoast: Float32Array
	landmarks: GenesisLandmarks
	params?: Pick<
		Partial<GenesisParams>,
		| "substellarLon"
		| "eccentricity"
		| "obliquity"
		| "perihelion"
		| "planetRadiusKm"
		| "tideLock"
		| "hoursPerDay"
	>
	monthlyTEQ?: Float32Array[]
}

export type ApplyCurrentTemperatureEffectParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	currents: GenesisOceanCurrents
	monthlyTEQ?: Float32Array[]
	params?: Pick<
		GenesisParams,
		"substellarLon" | "eccentricity" | "obliquity" | "perihelion" | "tideLock"
	>
}

export type BuildOceanCurrentGridParams = {
	mesh: SphereMesh
	oceanWarmth: Float32Array
	isLand: Uint8Array
	latDeg: Float32Array
	lonDeg: Float32Array
	reverseCirculation?: boolean
	planetRadiusKm?: number
}
