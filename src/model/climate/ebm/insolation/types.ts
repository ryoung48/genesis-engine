import type { OrbitalParams, StellarParams } from "@/model/climate/ebm/types"

export interface InsolationComputeParams {
	lats: number[]
	orbital: OrbitalParams
	stellarOverride?: StellarParams
}
