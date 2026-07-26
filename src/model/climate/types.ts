export type { PastaDebug } from "./pasta"
export type { TidalSchedule } from "./tidal-schedule"
export type { WindArrowData } from "./wind"

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
		import("../types").GenesisClimate,
		| "temperature_monthly"
		| "temperature_monthly_range"
		| "insolation_monthly"
		| "pet_monthly"
	>
	/** Optional day-count conversion used when deriving monthly PET. */
	params?: Pick<import("../types").GenesisParams, "daysPerYear">
}

export type ComputeAetFromPetParams = {
	rain: Float64Array
	petBuf: Float64Array
	aetBuf: Float64Array
}

export type ComputeHydrologyFieldsParams = {
	climate: Pick<import("../types").GenesisClimate, "pet_monthly">
	rainfall: Pick<import("../types").GenesisRainfall, "monthly">
	isLand: Uint8Array
}

export type ComputeLandFractionParams = {
	mesh: import("../types").SphereMesh
	isLand: Uint8Array
}

export type ComputeMonthlyDaylightHoursParams = {
	mesh: import("../types").SphereMesh
	params: import("../types").GenesisParams
}

export type ApplyDtrToClimateMinMaxParams = {
	climate: import("../types").GenesisClimate
	dtr_monthly: Float32Array
	N: number
}

export type ComputeTemperatureParams = {
	mesh: import("../types").SphereMesh
	elevation: Float32Array
	landFraction: number[]
	params: import("../types").GenesisParams
	oceanDist?: Float32Array
	isLand?: Uint8Array
	elevation_km?: Float32Array
}

export type ApplyTemperatureNoiseParams = {
	mesh: import("../types").SphereMesh
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
	mesh: import("../types").SphereMesh
	params: Pick<
		import("../types").GenesisParams,
		| "substellarLon"
		| "eccentricity"
		| "hoursPerDay"
		| "obliquity"
		| "perihelion"
	>
}

export type ComputeTidalTemperatureParams = {
	mesh: import("../types").SphereMesh
	elevation: Float32Array
	landFraction: number[]
	params: import("../types").GenesisParams
	oceanDist?: Float32Array
	elevation_km?: Float32Array
}

export type ComputeLockedOceanCurrentsParams = {
	mesh: import("../types").SphereMesh
	isLand: Uint8Array
	landmarks: import("../terrain/landmarks").GenesisLandmarks
	params?: Partial<import("../types").GenesisParams>
}

export type ApplyLockedCurrentTemperatureEffectParams = {
	mesh: import("../types").SphereMesh
	climate: import("../types").GenesisClimate
	isLand: Uint8Array
	currents: import("../types").GenesisOceanCurrents
	params?: Partial<import("../types").GenesisParams>
}

export type BuildLockedOceanCurrentGridParams = {
	mesh: import("../types").SphereMesh
	oceanWarmth: Float32Array
	isLand: Uint8Array
	latDeg: Float32Array
	lonDeg: Float32Array
	params?: Pick<
		import("../types").GenesisParams,
		"substellarLon" | "eccentricity" | "obliquity" | "perihelion"
	>
	currentMonth?: number
}
