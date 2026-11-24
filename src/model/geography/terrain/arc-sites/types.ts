import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { SimSpace } from "@/model/geography/tectonics/sim-mesh/types"

export interface BuildArcSitesParams {
	space: SimSpace
	crust: CrustRaster
	arcFront: Uint8Array
	formedAtMyr: Float32Array
	seed: number
}

export interface StrikeParams {
	space: SimSpace
	crust: CrustRaster
	cell: number
}
