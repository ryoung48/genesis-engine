/**
 * Sampling + attachment of observed-Earth raster climate data (temperature,
 * precipitation, DTR) onto the mesh. Shared by the import pipeline (which
 * needs these fields attached before post-elevation runs the Pasta climate
 * classification, so vegetation for Earth imports can use observed rather
 * than procedural climate) and any other caller wanting the same sampling.
 */
import type { GenesisWorld, SphereMesh } from ".."

export function sampleMonthlyFloatRaster(
	mesh: SphereMesh,
	raster: Int16Array,
	rasterW: number,
	rasterH: number,
	months: number,
	scale: number,
	nodata: number,
): Float32Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const out = new Float32Array(months * N)

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const lat = Math.asin(Math.max(-1, Math.min(1, z)))
		const lon = Math.atan2(y, x)
		const px = (lon / Math.PI + 1) * 0.5 * rasterW
		const py = (0.5 - lat / Math.PI) * rasterH

		const x0 = Math.floor(px)
		const y0 = Math.floor(py)
		const x1 = (x0 + 1) % rasterW
		const y1 = Math.min(y0 + 1, rasterH - 1)
		const fx = px - x0
		const fy = py - y0
		const xi0 = (((x0 % rasterW) + rasterW) % rasterW) | 0
		const yi0 = Math.max(0, Math.min(rasterH - 1, y0)) | 0

		for (let month = 0; month < months; month++) {
			const monthOffset = month * rasterW * rasterH
			const q00 = raster[monthOffset + yi0 * rasterW + xi0]
			const q10 = raster[monthOffset + yi0 * rasterW + x1]
			const q01 = raster[monthOffset + y1 * rasterW + xi0]
			const q11 = raster[monthOffset + y1 * rasterW + x1]
			const v00 = q00 === nodata ? NaN : q00 * scale
			const v10 = q10 === nodata ? NaN : q10 * scale
			const v01 = q01 === nodata ? NaN : q01 * scale
			const v11 = q11 === nodata ? NaN : q11 * scale

			let weighted = 0
			let weightSum = 0
			if (Number.isFinite(v00)) {
				const w = (1 - fx) * (1 - fy)
				weighted += v00 * w
				weightSum += w
			}
			if (Number.isFinite(v10)) {
				const w = fx * (1 - fy)
				weighted += v10 * w
				weightSum += w
			}
			if (Number.isFinite(v01)) {
				const w = (1 - fx) * fy
				weighted += v01 * w
				weightSum += w
			}
			if (Number.isFinite(v11)) {
				const w = fx * fy
				weighted += v11 * w
				weightSum += w
			}

			out[month * N + r] = weightSum > 0 ? weighted / weightSum : NaN
		}
	}

	return out
}

export function attachObservedEarthClimate(params: {
	mesh: SphereMesh
	climate: GenesisWorld["climate"]
	realClimateMonthly: Int16Array
	realClimateWidth: number
	realClimateHeight: number
	realClimateMonths: number
	realClimateScale: number
	realClimateNoData: number
}): void {
	const {
		mesh,
		climate,
		realClimateMonthly,
		realClimateWidth,
		realClimateHeight,
		realClimateMonths,
		realClimateScale,
		realClimateNoData,
	} = params
	if (realClimateMonths !== 12) return

	const N = mesh.numRegions
	const observedMonthly = sampleMonthlyFloatRaster(
		mesh,
		realClimateMonthly,
		realClimateWidth,
		realClimateHeight,
		realClimateMonths,
		realClimateScale,
		realClimateNoData,
	)
	const observedAnnual = new Float32Array(N)
	const diffMonthly = new Float32Array(N * realClimateMonths)
	const diffAnnual = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		let observedSum = 0
		let observedCount = 0
		let diffSum = 0
		let diffCount = 0
		for (let month = 0; month < realClimateMonths; month++) {
			const idx = month * N + r
			const observed = observedMonthly[idx]
			if (Number.isFinite(observed)) {
				observedSum += observed
				observedCount++
				diffMonthly[idx] = climate.temperature_monthly[idx] - observed
				diffSum += diffMonthly[idx]
				diffCount++
			} else {
				diffMonthly[idx] = NaN
			}
		}
		observedAnnual[r] = observedCount > 0 ? observedSum / observedCount : NaN
		diffAnnual[r] = diffCount > 0 ? diffSum / diffCount : NaN
	}

	climate.real_temperature_monthly = observedMonthly
	climate.real_temperature_avg = observedAnnual
	climate.temperature_diff_monthly = diffMonthly
	climate.temperature_diff_avg = diffAnnual
}

export function attachObservedEarthRainfall(params: {
	mesh: SphereMesh
	rainfall: GenesisWorld["rainfall"]
	realPrecipMonthly: Int16Array
	realPrecipWidth: number
	realPrecipHeight: number
	realPrecipMonths: number
	realPrecipScale: number
	realPrecipNoData: number
}): void {
	const {
		mesh,
		rainfall,
		realPrecipMonthly,
		realPrecipWidth,
		realPrecipHeight,
		realPrecipMonths,
		realPrecipScale,
		realPrecipNoData,
	} = params
	if (realPrecipMonths !== 12) return

	const N = mesh.numRegions
	const observedMonthly = sampleMonthlyFloatRaster(
		mesh,
		realPrecipMonthly,
		realPrecipWidth,
		realPrecipHeight,
		realPrecipMonths,
		realPrecipScale,
		realPrecipNoData,
	)
	const observedAnnual = new Float32Array(N)
	const diffMonthly = new Float32Array(N * realPrecipMonths)
	const diffAnnual = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		let observedSum = 0
		let observedCount = 0
		let diffSum = 0
		let diffCount = 0
		for (let month = 0; month < realPrecipMonths; month++) {
			const idx = month * N + r
			const observed = observedMonthly[idx]
			if (Number.isFinite(observed)) {
				observedSum += observed
				observedCount++
				diffMonthly[idx] = rainfall.monthly[idx] - observed
				diffSum += diffMonthly[idx]
				diffCount++
			} else {
				diffMonthly[idx] = NaN
			}
		}
		observedAnnual[r] = observedCount > 0 ? observedSum : NaN
		diffAnnual[r] = diffCount > 0 ? diffSum : NaN
	}

	rainfall.real_monthly = observedMonthly
	rainfall.real_annual = observedAnnual
	rainfall.diff_monthly = diffMonthly
	rainfall.diff_annual = diffAnnual
}

export function attachObservedEarthDtr(params: {
	mesh: SphereMesh
	world: {
		dtr_monthly: Float32Array
		observedDtr?: GenesisWorld["observedDtr"]
	}
	realDtrMonthly: Int16Array
	realDtrWidth: number
	realDtrHeight: number
	realDtrMonths: number
	realDtrScale: number
	realDtrNoData: number
}): void {
	const {
		mesh,
		world,
		realDtrMonthly,
		realDtrWidth,
		realDtrHeight,
		realDtrMonths,
		realDtrScale,
		realDtrNoData,
	} = params
	if (realDtrMonths !== 12) return

	const N = mesh.numRegions
	const observedMonthly = sampleMonthlyFloatRaster(
		mesh,
		realDtrMonthly,
		realDtrWidth,
		realDtrHeight,
		realDtrMonths,
		realDtrScale,
		realDtrNoData,
	)
	const observedAnnual = new Float32Array(N)
	const diffMonthly = new Float32Array(N * realDtrMonths)
	const diffAnnual = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		let observedSum = 0
		let observedCount = 0
		let diffSum = 0
		let diffCount = 0
		for (let month = 0; month < realDtrMonths; month++) {
			const idx = month * N + r
			const observed = observedMonthly[idx]
			if (Number.isFinite(observed)) {
				observedSum += observed
				observedCount++
				diffMonthly[idx] = world.dtr_monthly[idx] - observed
				diffSum += diffMonthly[idx]
				diffCount++
			} else {
				diffMonthly[idx] = NaN
			}
		}
		observedAnnual[r] = observedCount > 0 ? observedSum / observedCount : NaN
		diffAnnual[r] = diffCount > 0 ? diffSum / diffCount : NaN
	}

	world.observedDtr = {
		real_monthly: observedMonthly,
		real_annual: observedAnnual,
		diff_monthly: diffMonthly,
		diff_annual: diffAnnual,
	}
}
