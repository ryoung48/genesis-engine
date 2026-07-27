import type { GenesisRainfall } from "@/model/types/climate"
import type { SphereMesh } from "@/model/types/mesh"

export interface ComputeProvincesParams {
	mesh: SphereMesh
	isLand: Uint8Array
	topography: Uint8Array
	seed: number
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	}
}

export interface ComputeWeightedProvincesParams {
	mesh: SphereMesh
	isLand: Uint8Array
	_topography: Uint8Array
	seedRegions: Int32Array
	seedNames: string[]
	seed: number
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	}
	seedWeights?: Float32Array
}

export interface ComputeProvincesFromRasterParams {
	mesh: SphereMesh
	isLand: Uint8Array
	regionIds: Int16Array
	seed: number
	options?: {
		climateZones?: Uint8Array
		rainfall?: GenesisRainfall
		oceanCoastal?: Uint8Array
		lakeCoastal?: Uint8Array
		riverVisible?: Uint8Array
		planetRadiusKm?: number
	}
	fallbackSeeds?: { id: number; lon: number; lat: number }[]
}

export interface CompetitiveBfsAssignParams {
	mesh: SphereMesh
	isLand: Uint8Array
	topography: Uint8Array
	seeds: Int32Array
}

export interface HslToRgbParams {
	h: number
	s: number
	l: number
}

export interface GenerateProvinceColorsParams {
	count: number
	rng: { random(): number }
}
