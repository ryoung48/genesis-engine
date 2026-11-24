import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { SimSpace } from "@/model/geography/tectonics/sim-mesh/types"

export interface BuildGeologicRecordParams {
	space: SimSpace
	crust: CrustRaster
	seed: number
	land: Uint8Array
}

export interface OldFloodBasalts {
	age: Float32Array
	worn: Float32Array
	cells: number
	provinces: number
}

export interface GeologicRecord {
	oldLip: OldFloodBasalts
	shares: Record<string, number>
}

export interface FaciesMix {
	km: number
	carb: number
	salt: number
	coal: number
	organic: number
}

export interface LayParams {
	mix: FaciesMix
	km: number
	carb: number
	salt: number
	coal: number
	organic: number
}

export interface OldFloodParams {
	space: SimSpace
	crust: CrustRaster
	isLand: (cell: number) => boolean
	toSea: Float64Array
	seed: number
}
