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
	/** [JUSTIFICATION] only eras that cap republic size supply this; others leave it unset */
	maxRepublicSize?: number
	/** [JUSTIFICATION] only eras that cap theocracy size supply this; others leave it unset */
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
