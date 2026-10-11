import { GovernmentMix } from "@/model/society/types"

export interface AssignGovernmentTypeParams {
	nationIndex: number
	capitalProvince: number
	nationSize: number
	eraMix: GovernmentMix
	sizeWeight: number
	habitability: Float32Array
	waterAccess: Uint8Array
	migrationWave: Float32Array | undefined
	statehoodFraction: number
	seed: number
	// [JUSTIFICATION] Only eras that cap republic size supply this.
	maxRepublicSize?: number
	// [JUSTIFICATION] Only eras that cap theocracy size supply this.
	maxTheocracySize?: number
}

export interface RefineGovernmentSubtypeParams {
	mainType: number
	size: number
	wave: number
	hab: number
	water: number
	sizeWeight: number
	r: number
}

export type SuccessionSystem = "single_heir" | "election" | "appointment"

export interface MonarchySubtypeParams {
	size: number
	sizeWeight: number
	r: number
}
