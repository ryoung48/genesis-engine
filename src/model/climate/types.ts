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
	temperature_monthly_range: Float32Array // flattened [month * numRegions + region] within-month temperature range °C
	insolation_monthly: Float32Array // flattened [month * numRegions + region] mean insolation W/m²
	declination_monthly: Float32Array // per-month sub-solar latitude in degrees
	pet_monthly: Float32Array // flattened [month * numRegions + region] PET mm
	daylight_hours_monthly: Float32Array // flattened [month * numRegions + region] daylight hours
	landFraction: number[] // 36-band land fraction used by EBM
	/** CLOUD_COVER.estimate's modeled proxy, [month * numRegions + region],
	 * cached once (by the cloud-cover temperature modifier, which already
	 * computes it for every cell/month) so hover/map display don't each
	 * recompute the same values from the same modeled inputs. */
	cloud_cover_monthly?: Float32Array
	/** Same proxy, but computed from OBSERVED (real-Earth) aet/pet/rainfall/
	 * dtr/temperature inputs once those are attached -- diverges from
	 * cloud_cover_monthly for an imported Earth world, since hover/map prefer
	 * observed inputs there. Cached the same way, for the same reason. */
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
	// SST anomaly relative to the monthly zonal mean, divided by the display scale.
	sst: Float32Array
	sstMonthly: Float32Array
	// Physical eastward/northward surface velocity in m/s, month-major.
	uMonthly: Float32Array
	vMonthly: Float32Array
	temperatureDeltaMonthly: Float32Array
	ocean: Uint8Array
	circulationCycleError: number
	heatCycleError: number
	spinupYears: number
}

export interface GenesisHydrology {
	aet_monthly: Float32Array // [month * N + r] mm
	aridity_monthly: Float32Array // [month * N + r] AET / PET
	baseflow_monthly: Float32Array // [month * N + r] mm — slow groundwater discharge
}
