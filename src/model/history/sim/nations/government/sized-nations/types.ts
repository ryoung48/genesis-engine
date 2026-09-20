import type { SizedGovernmentShare } from "@/model/society/eras/types"

export interface AssignSizedNationsParams {
	sizeShares: SizedGovernmentShare[]
	sizes: number[]
	seeds: number[]
	nationMembers: number[][]
	urbanPop: Float32Array
	habitability: Float32Array
	waterAccess: Uint8Array
	migrationWave: Float32Array | undefined
	seed: number
}

export interface NationScoreParams {
	members: number[]
	values: ArrayLike<number>
}

export interface RankedNation {
	nation: number
	score: number
}
