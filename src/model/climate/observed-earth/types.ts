import type { SphereMesh } from "@/model/mesh/types"

export type SampleMonthlyFloatRasterParams = {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	months: number
	scale: number
	nodata: number
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

export interface GenesisObservedWind {
	real_u_monthly?: Float32Array // [month * N + r] observed monthly eastward wind m/s (NCEP/NCAR 10m reanalysis)
	real_v_monthly?: Float32Array // [month * N + r] observed monthly northward wind m/s
	real_speed_monthly?: Float32Array // [month * N + r] hypot(u, v)
}

export interface GenesisObservedCurrent {
	real_u_monthly?: Float32Array // [month * N + r] observed monthly eastward surface current m/s (GODAS)
	real_v_monthly?: Float32Array // [month * N + r] observed monthly northward surface current m/s
	real_speed_monthly?: Float32Array // [month * N + r] hypot(u, v)
	// [month * N + r] SST minus that month's zonal (same-latitude) mean SST, °C
	// (NOAA OISST) -- positive marks a warm current, negative a cold current,
	// independent of raw latitude-driven temperature.
	real_sst_anomaly_monthly?: Float32Array
}
