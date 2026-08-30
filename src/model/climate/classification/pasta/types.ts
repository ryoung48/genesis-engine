import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisRainfall,
} from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type GdmParams = {
	temp: number
	monthDays: number
	base: number
	platStart: number
	platEnd: number
	comp: number
}

export type GddiDayParams = {
	insolationWm2: number
	baseline: number
}

export type GddTotalParams = {
	gdd: Float64Array
	gint: Float64Array
	gddAcc: Float64Array
	giAcc: Float64Array
	gintInterruptionThreshold: number | null
}

export type ClassifyOceanParams = PastaClassificationBuffers & {
	iceMin: number
	iceMax: number
	dpm: number
	warmest: number
	coldest: number
}

export type ClassifyLandParams = PastaClassificationBuffers & {
	rain: Float64Array
	petBuf: Float64Array
	aetBuf: Float64Array
	mGDD: Float64Array
	iceVal: number
	dpm: number
	gintThreshold: number
	warmest: number
	coldest: number
}

export type ComputePastaZonesParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	temperatureMonthly: Float32Array
	temperatureMax: Float32Array
	temperatureMin: Float32Array
	insolationMonthly: Float32Array
	rainfallMonthly: Float32Array
	petMonthly: Float32Array
	aetMonthly: Float32Array
	params: GenesisParams
	/** Omitted when no ice model has been computed. */
	iceThickness?: Float32Array
	/** Omitted when no monthly minimum ice values have been computed. */
	iceMinMonthly?: Float32Array
	/** Omitted when no monthly maximum ice values have been computed. */
	iceMaxMonthly?: Float32Array
}

export type AssignEarthPastaClimateParams = Omit<
	AssignPastaClimateParams,
	"hydrology"
> & {
	/** Omitted when observed monthly temperature ranges are unavailable. */
	realDtrMonthly?: Float32Array
}

export type PastaDebug = {
	gdd: Float32Array
	gar: Float32Array
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
