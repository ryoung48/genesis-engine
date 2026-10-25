export interface GenesisClimate {
	// [JUSTIFICATION] V1 winds require the pre-lapse temperature; v2 and locked solvers do not produce it.
	temperature_monthly_nolapse?: Float32Array
	temperature_avg: Float32Array // per-cell annual mean °C
	temperature_min: Float32Array // per-cell annual min °C
	temperature_max: Float32Array // per-cell annual max °C
	temperature_monthly: Float32Array // flattened [month * numRegions + region] mean °C
	real_temperature_avg?: Float32Array // per-cell observed annual mean °C for imported Earth worlds
	real_temperature_monthly?: Float32Array // flattened [month * numRegions + region] observed mean °C
	temperature_diff_avg?: Float32Array // per-cell annual modeled minus observed °C
	temperature_diff_monthly?: Float32Array // flattened [month * numRegions + region] modeled minus observed °C
	temperature_monthly_range: Float32Array // flattened [month * numRegions + region] within-month temperature range °C
	insolation_monthly: Float32Array // flattened [month * numRegions + region] mean insolation W/m²
	declination_monthly: Float32Array // per-month sub-solar latitude in degrees
	pet_monthly: Float32Array // flattened [month * numRegions + region] PET mm
	daylight_hours_monthly: Float32Array // flattened [month * numRegions + region] daylight hours
	// [JUSTIFICATION] Cloud cover is attached by v2 or the tidal cloud modifier after initial temperature construction.
	cloud_cover_monthly?: Float32Array
	// [JUSTIFICATION] An observed-input display estimate is available only for imported Earth worlds.
	real_cloud_cover_monthly?: Float32Array
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

export interface GenesisOceanCurrents {
	sst: Float32Array // per-cell SST anomaly vs zonal mean, normalized -1..+1
	sstMonthly: Float32Array // [month * N + r]
	flowU: Float32Array // per-cell eastward surface current, ~m/s
	flowV: Float32Array // per-cell northward surface current, ~m/s
	flowUMonthly: Float32Array // [month * N + r]
	flowVMonthly: Float32Array // [month * N + r]
}

export interface GenesisHydrology {
	aet_monthly: Float32Array // [month * N + r] mm
	aridity_monthly: Float32Array // [month * N + r] AET / PET
	baseflow_monthly: Float32Array // [month * N + r] mm — slow groundwater discharge
}
