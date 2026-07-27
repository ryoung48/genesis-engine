import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export interface GenesisClimate {
	temperature_avg: Float32Array // per-cell annual mean °C
	temperature_min: Float32Array // per-cell annual min °C
	temperature_max: Float32Array // per-cell annual max °C
	temperature_monthly: Float32Array // flattened [month * numRegions + region] mean °C
	real_temperature_avg?: Float32Array // per-cell observed annual mean °C for imported Earth worlds
	real_temperature_monthly?: Float32Array // flattened [month * numRegions + region] observed mean °C
	temperature_diff_avg?: Float32Array // per-cell annual modeled minus observed °C
	temperature_diff_monthly?: Float32Array // flattened [month * numRegions + region] modeled minus observed °C
	temperature_monthly_nolapse: Float32Array // flattened [month * numRegions + region] mean °C before terrain lapse correction
	temperature_monthly_range: Float32Array // flattened [month * numRegions + region] within-month temp range °C (for Hargreaves td)
	insolation_monthly: Float32Array // flattened [month * numRegions + region] mean insolation W/m²
	pet_monthly: Float32Array // flattened [month * numRegions + region] PET mm
	daylight_hours_monthly: Float32Array // flattened [month * numRegions + region] daylight hours
	landFraction: number[] // 36-band land fraction used by EBM
}

export interface GenesisOceanCurrents {
	/** Per-cell ocean warmth: -1 (cold) to +1 (warm). Zero for land. */
	oceanWarmth: Float32Array
	/** Per-cell diffused coastal warmth on land: -1..+1. Zero for ocean/deep interior. */
	coastalWarmth: Float32Array
	/** Per-cell monthly ocean warmth, flattened [month * N + r]. Optional seasonal field. */
	oceanWarmthMonthly?: Float32Array
	/** Per-cell monthly coastal warmth, flattened [month * N + r]. Optional seasonal field. */
	coastalWarmthMonthly?: Float32Array
	/** Per-cell monthly temperature delta applied by ocean currents, flattened [month * N + r]. */
	temperatureDeltaMonthly?: Float32Array
	/** Per-cell temperature delta applied by ocean currents (°C). Zero where no effect. */
	temperatureDelta: Float32Array
}

export interface GenesisRainfall {
	monthly: Float32Array // [month * N + r] mm
	annual: Float32Array // per-cell annual mm
	real_monthly?: Float32Array // [month * N + r] observed monthly precipitation mm for imported Earth worlds
	real_annual?: Float32Array // per-cell observed annual precipitation mm
	diff_monthly?: Float32Array // [month * N + r] modeled minus observed precipitation mm
	diff_annual?: Float32Array // per-cell annual modeled minus observed precipitation mm
	east: Float32Array // per-cell normalized east moisture (0–1)
	west: Float32Array // per-cell normalized west moisture (0–1)
}

export interface GenesisObservedDtr {
	real_monthly?: Float32Array // [month * N + r] observed monthly DTR °C for imported Earth worlds
	real_annual?: Float32Array // per-cell observed annual-mean DTR °C
	diff_monthly?: Float32Array // [month * N + r] modeled minus observed DTR °C
	diff_annual?: Float32Array // per-cell annual modeled minus observed DTR °C
}

export interface GenesisObservedHumidity {
	real_monthly?: Float32Array // [month * N + r] observed monthly relative humidity % for imported Earth worlds
	real_annual?: Float32Array // per-cell observed annual-mean relative humidity %
}

export interface GenesisHydrology {
	aet_monthly: Float32Array // [month * N + r] mm
	aridity_monthly: Float32Array // [month * N + r] AET / PET
	baseflow_monthly: Float32Array // [month * N + r] mm — slow groundwater discharge
}

export interface GenesisHazards {
	earthquake: Float32Array
	volcano: Float32Array
	danger: Float32Array
}

interface GenesisHotspotExposureSummary {
	threshold: number
	activeCells: number
	aboveWaterBeforeFlood: number
	aboveWaterAfterFlood: number
}

export interface GenesisVolcanism {
	hotspot: Float32Array
	mantleUpwelling: Float32Array
	hotspotExposure?: GenesisHotspotExposureSummary
}

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
