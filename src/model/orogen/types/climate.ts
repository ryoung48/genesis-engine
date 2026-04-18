export interface OrogenClimate {
	temperature_avg: Float32Array // per-cell annual mean °C
	temperature_min: Float32Array // per-cell annual min °C
	temperature_max: Float32Array // per-cell annual max °C
	temperature_monthly: Float32Array // flattened [month * numRegions + region] mean °C
	temperature_monthly_nolapse: Float32Array // flattened [month * numRegions + region] mean °C before terrain lapse correction
	temperature_monthly_range: Float32Array // flattened [month * numRegions + region] within-month temp range °C (for Hargreaves td)
	insolation_monthly: Float32Array // flattened [month * numRegions + region] mean insolation W/m²
	pet_monthly: Float32Array // flattened [month * numRegions + region] PET mm
	daylight_hours_monthly: Float32Array // flattened [month * numRegions + region] daylight hours
	landFraction: number[] // 36-band land fraction used by EBM
}

export interface OrogenOceanCurrents {
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

export interface OrogenWind {
	/** Per-cell eastward wind component, [month * N + r] */
	wind_east_monthly: Float32Array
	/** Per-cell northward wind component, [month * N + r] */
	wind_north_monthly: Float32Array
	/** Per-cell wind speed (0–1 normalized), [month * N + r] */
	wind_speed_monthly: Float32Array
}

export interface OrogenRainfall {
	monthly: Float32Array // [month * N + r] mm
	annual: Float32Array // per-cell annual mm
	east: Float32Array // per-cell normalized east moisture (0–1)
	west: Float32Array // per-cell normalized west moisture (0–1)
}

export interface OrogenHydrology {
	aet_monthly: Float32Array // [month * N + r] mm
	aridity_monthly: Float32Array // [month * N + r] AET / PET
	baseflow_monthly: Float32Array // [month * N + r] mm — slow groundwater discharge
}

export interface OrogenHazards {
	earthquake: Float32Array
	volcano: Float32Array
	danger: Float32Array
}

export interface OrogenVolcanism {
	hotspot: Float32Array
}
