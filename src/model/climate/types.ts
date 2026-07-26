import type { MainSequenceClass } from "../celestial/star/types"
import type { GenesisLandmarks } from "../terrain"
import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisOceanCurrents,
	GenesisParams,
	GenesisRainfall,
	SphereMesh,
} from "../types"
import type { WindSurface } from "./wind"
export type PastaDebug = {
	gdd: Float32Array
	gint: Float32Array
	gdd_monthly: Float32Array
	gint_monthly: Float32Array
	minT: Float32Array
	maxT: Float32Array
}
export type { TidalSchedule } from "./tidal-schedule"

export type ApparentTemperatureParams = {
	tempC: number
	rhPercent: number
	windSpeedMs: number
}

export type RelativeHumidityFromVaporPressureParams = {
	meanTempC: number
	vaporPressureKpa: number
}

export type RelativeHumidityFromTempRangeParams = {
	meanTempC: number
	dtrC: number
	/** Optional AET/PET aridity ratio used to bias the dewpoint in dry climates. */
	annualAridity?: number
	/** Optional annual rainfall used for moisture-source and dry-air corrections. */
	annualRainfallMm?: number
	/** Optional distance from the ocean used for continentality correction. */
	distFromOceanKm?: number
}

export type FillPetMonthlyHargreavesParams = {
	temperatureMonthly: Float32Array
	rangeMonthly: Float32Array
	insolationMonthly: Float32Array
	petMonthly: Float32Array
	dpm: number
}

export type RefreshClimatePetMonthlyParams = {
	climate: Pick<
		GenesisClimate,
		| "temperature_monthly"
		| "temperature_monthly_range"
		| "insolation_monthly"
		| "pet_monthly"
	>
	/** Optional day-count conversion used when deriving monthly PET. */
	params?: Pick<GenesisParams, "daysPerYear">
}

export type ComputeAetFromPetParams = {
	rain: Float64Array
	petBuf: Float64Array
	aetBuf: Float64Array
}

export type ComputeHydrologyFieldsParams = {
	climate: Pick<GenesisClimate, "pet_monthly">
	rainfall: Pick<GenesisRainfall, "monthly">
	isLand: Uint8Array
}

export type ComputeLandFractionParams = {
	mesh: SphereMesh
	isLand: Uint8Array
}

export type ComputeMonthlyDaylightHoursParams = {
	mesh: SphereMesh
	params: GenesisParams
}

export type ApplyDtrToClimateMinMaxParams = {
	climate: GenesisClimate
	dtr_monthly: Float32Array
	N: number
}

export type ComputeTemperatureParams = {
	mesh: SphereMesh
	elevation: Float32Array
	landFraction: number[]
	params: GenesisParams
	oceanDist?: Float32Array
	isLand?: Uint8Array
	elevation_km?: Float32Array
}

export type ApplyTemperatureNoiseParams = {
	mesh: SphereMesh
	N: number
	seed: number
	temperature_monthly: Float32Array
	temperature_monthly_nolapse: Float32Array
	computeTaper: (r: number, x: number, y: number, z: number) => number
	includeCell: (r: number) => boolean
	temperature_avg?: Float32Array
	temperature_min?: Float32Array
	temperature_max?: Float32Array
}

export type RecomputeAnnualTemperatureStatsParams = {
	temperature_monthly: Float32Array
	temperature_avg: Float32Array
	temperature_min: Float32Array
	temperature_max: Float32Array
	N: number
}

export type MonthlyLibrationParams = {
	eccentricity: number
	perihelion: number
}

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
	threshold: number
}

export type PastaClassificationBuffers = {
	temps: Float64Array
	insol: Float64Array
	mGDDz: Float64Array
	mGInt: Float64Array
	gddAccBuf: Float64Array
	giAccBuf: Float64Array
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

export type AssignEarthPastaClimateParams = Omit<
	AssignPastaClimateParams,
	"hydrology"
> & {
	/** Omitted when observed monthly temperature ranges are unavailable. */
	realDtrMonthly?: Float32Array
}

export type BuildRegionGraphParams = {
	mesh: SphereMesh
	mask: Uint8Array
}

export type ComputeRainBandWarpFieldParams = {
	mesh: SphereMesh
	seed: number
	amplitudeDeg: number
	/** Omitted to generate a warp value for every mesh region. */
	regions?: ArrayLike<number>
}

export type BuildRainRegionMaskParams = {
	isLand: Uint8Array
	/** Omitted when every land cell should be eligible for rainfall. */
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">
}

export type ComputeThermalEquatorParams = {
	mesh: SphereMesh
	temps: Float32Array
	/** Omitted to use the standard 120 longitude bins. */
	numBins?: number
}

export type ComputeAdvectionParams = {
	mesh: SphereMesh
	elevation: Float32Array
	distCoast: Float32Array
	/** Omitted when annual thermal-equator steering is unavailable. */
	climate?: GenesisClimate
	/** Accepts a radius directly for callers that only have that value. */
	params?: number | Pick<GenesisParams, "planetRadiusKm">
	isLand: Uint8Array
	/** Omitted when elevation must be derived from the normalized field. */
	elevation_km?: Float32Array
}

export type ComputeRainWeightParams = {
	cellLat: number
	teq: number
	eastMoisture: number
	westMoisture: number
	daysPerYear: number
	bandOffsetDeg: number
}

export type ComputeMonthlyRainParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	eastAdv: Float32Array
	westAdv: Float32Array
	isLand: Uint8Array
	/** Omitted only in callers without generation settings. */
	params?: GenesisParams
	/** Omitted to derive thermal equator fields from monthly temperatures. */
	monthlyTEQ?: Float32Array[]
	/** Omitted when coastal distance does not influence rainfall. */
	distCoast?: Float32Array
	/** Omitted when landmarks do not alter the rain mask. */
	landmarks?: Pick<GenesisLandmarks, "regionLandmark" | "type">
}

export type TideContributionParams = {
	bodyLatRad: number
	bodyLonRad: number
	bodyDistanceM: number
	bodyMassKg: number
	surfaceLatRad: number
	surfaceLonRad: number
	planetMassKg: number
	planetRadiusM: number
}

export type MoonMoonTideContributionParams = {
	raisedMoonRadiusM: number
	raisedMoonMassKg: number
	raisingMoonMassKg: number
	separationM: number
}

export type StarTidalPositionParams = {
	orbitalDistanceAU: number
	planetEccentricity: number
	perihelionLonDeg: number
	t: number
	daysPerYear: number
}

export type StarTideContributionParams = {
	starLatRad: number
	starLonRad: number
	starDistanceM: number
	spectralClass: MainSequenceClass
	starSubtype: number
	surfaceLatRad: number
	surfaceLonRad: number
	planetMassKg: number
	planetRadiusM: number
}

export type ApparentDiameterRadParams = {
	bodyDiameterM: number
	distanceM: number
}
export type LockedDeclinationParams = {
	obliquity: number
	eccentricity: number
	perihelion: number
}
export type SubstellarDirectionParams = {
	substellarLon: number
	lonOffsetRad: number
	declinationRad: number
}
export type LockedMonthlyDaylightHoursParams = {
	mesh: SphereMesh
	params: Pick<
		GenesisParams,
		| "substellarLon"
		| "eccentricity"
		| "hoursPerDay"
		| "obliquity"
		| "perihelion"
	>
}

export type ComputeTidalTemperatureParams = {
	mesh: SphereMesh
	elevation: Float32Array
	landFraction: number[]
	params: GenesisParams
	oceanDist?: Float32Array
	elevation_km?: Float32Array
}

export type ComputeLockedOceanCurrentsParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	landmarks: GenesisLandmarks
	params?: Partial<GenesisParams>
}

export type ApplyLockedCurrentTemperatureEffectParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	currents: GenesisOceanCurrents
	params?: Partial<GenesisParams>
}

export type BuildLockedOceanCurrentGridParams = {
	mesh: SphereMesh
	oceanWarmth: Float32Array
	isLand: Uint8Array
	latDeg: Float32Array
	lonDeg: Float32Array
	params?: Pick<
		GenesisParams,
		"substellarLon" | "eccentricity" | "obliquity" | "perihelion"
	>
	currentMonth?: number
}

export type ComputeCycloneRiskParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	topography: Uint8Array
	params: Pick<GenesisParams, "hoursPerDay" | "tideLock">
	oceanCurrents?: GenesisOceanCurrents | null
}

export type ComputeIceAccumulationParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	rainfall: GenesisRainfall
	isLand: Uint8Array
	distCoast: Float32Array
	cycles?: number
	planetRadiusKm?: number
}

export type AssignKoppenClimateParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
}

export type SampleMonthlyFloatRasterParams = {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	months: number
	scale: number
	nodata: number
}

export type ComputeTidalRainParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	params?: Pick<
		GenesisParams,
		| "seed"
		| "substellarLon"
		| "obliquity"
		| "pressure"
		| "eccentricity"
		| "perihelion"
		| "planetRadiusKm"
	>
	distCoast?: Float32Array
}

export type ComputeLockedWindVectorsParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	elevation_km: Float32Array
	params?: Pick<
		GenesisParams,
		"substellarLon" | "obliquity" | "eccentricity" | "perihelion" | "pressure"
	>
	month?: number
	surface?: WindSurface
}

export type ComputeOceanCurrentsParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	distCoast: Float32Array
	landmarks: GenesisLandmarks
	params?: Pick<
		Partial<GenesisParams>,
		| "substellarLon"
		| "eccentricity"
		| "obliquity"
		| "perihelion"
		| "planetRadiusKm"
		| "tideLock"
		| "hoursPerDay"
	>
	monthlyTEQ?: Float32Array[]
}

export type ApplyCurrentTemperatureEffectParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	currents: GenesisOceanCurrents
	monthlyTEQ?: Float32Array[]
	params?: Pick<
		GenesisParams,
		"substellarLon" | "eccentricity" | "obliquity" | "perihelion" | "tideLock"
	>
}

export type BuildOceanCurrentGridParams = {
	mesh: SphereMesh
	oceanWarmth: Float32Array
	isLand: Uint8Array
	latDeg: Float32Array
	lonDeg: Float32Array
	reverseCirculation?: boolean
	planetRadiusKm?: number
}

export type ComputeTornadoRiskParams = {
	mesh: SphereMesh
	temperatureAvg: Float32Array
	temperatureMax: Float32Array
	temperatureMin: Float32Array
	isLand: Uint8Array
	topography: Uint8Array
	vegetation: Uint8Array
	oceanDist: Float32Array
	params: Pick<GenesisParams, "hoursPerDay" | "tideLock">
}

export type AssignClimateZonesParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	temperatureAvg: Float32Array
	temperatureMin: Float32Array
	temperatureMax: Float32Array
}

export type AssignEarthClimateZonesParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	climate: GenesisClimate
}

export type AssignVegetationParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	climate: GenesisClimate
	rainfall: GenesisRainfall
	rng: () => number
	/** Omitted when Pasta zones are unavailable and the fallback classifier is used. */
	pastaZones?: Uint8Array
	/** Omitted when no growing-degree-day diagnostics were computed. */
	gdd?: Float32Array
	/** Omitted when no growing-aridity diagnostics were computed. */
	gar?: Float32Array
}
