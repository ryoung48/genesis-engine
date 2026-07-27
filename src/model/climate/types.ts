import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisParams,
	GenesisRainfall,
	SphereMesh,
} from "@/model/types"
export type PastaDebug = {
	gdd: Float32Array
	gint: Float32Array
	gdd_monthly: Float32Array
	gint_monthly: Float32Array
	minT: Float32Array
	maxT: Float32Array
}
export type PastaClassificationBuffers = {
	temps: Float64Array
	insol: Float64Array
	mGDDz: Float64Array
	mGInt: Float64Array
	gddAccBuf: Float64Array
	giAccBuf: Float64Array
}
export type AssignPastaClimateParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	climate: GenesisClimate
	rainfall: GenesisRainfall
	hydrology: GenesisHydrology
	params: GenesisParams
	/** Omitted when no ice model has been computed. */
	iceThickness?: Float32Array
	/** Omitted when no monthly minimum ice values have been computed. */
	iceMinMonthly?: Float32Array
	/** Omitted when no monthly maximum ice values have been computed. */
	iceMaxMonthly?: Float32Array
}
