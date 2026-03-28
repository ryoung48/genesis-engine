/**
 * Per-cell ice accumulation model using monthly temperature + precipitation.
 *
 * Snow accumulates when temp < 0°C, melts proportional to positive degree-days.
 * Iterated over multiple annual cycles until steady state.
 *
 * Output:
 *   iceThickness — final steady-state ice (mm w.e.) per cell
 *   iceMinMonthly — minimum ice level across 12 months of the final year (mm w.e.)
 *
 * Sea ice classification (per Pasta spec, 1cm snow ≈ 10% sea ice):
 *   Ofi: minIce > 80mm (8cm) in all months → >80% minimum cover
 *   Of:  maxIce > 20mm (2cm) in at least 1 month → >20% maximum cover
 */
import { TIME } from "../../utilities/time"
import type { OrogenClimate, OrogenRainfall, SphereMesh } from "../types"

// Positive degree-day melt factor: 4 mm w.e. per degree-day
const MELT_FACTOR = 4.0

// Pre-compute days per month
const DAYS_PER_MONTH = new Float64Array(12)
for (let m = 0; m < 12; m++) DAYS_PER_MONTH[m] = TIME.month.days(m).length

export interface IceResult {
	/** Final steady-state ice thickness per cell (mm w.e.) */
	iceThickness: Float32Array
	/** Minimum ice level across the 12 months of the final year (mm w.e.) */
	iceMinMonthly: Float32Array
	/** Maximum ice level across the 12 months of the final year (mm w.e.) */
	iceMaxMonthly: Float32Array
}

export function computeIceAccumulation(
	mesh: SphereMesh,
	climate: OrogenClimate,
	rainfall: OrogenRainfall,
	isLand: Uint8Array,
	distCoast?: Float32Array,
	cycles = 15,
): IceResult {
	const N = mesh.numRegions
	const ice = new Float32Array(N)
	const iceMin = new Float32Array(N)
	const iceMax = new Float32Array(N)

	// Pre-compute coastal boost for ocean cells.
	// Near-coast ocean freezes easier (shallow water, land sheltering).
	// Boost fades over ~8 BFS hops from coastline.
	const COAST_FADE = 8
	const coastBoost = new Float32Array(N)
	if (distCoast) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) continue
			const d = distCoast[r]
			if (d < COAST_FADE) {
				coastBoost[r] = 1 - d / COAST_FADE // 1.0 at coast, 0 at fade distance
			}
		}
	}

	// Run accumulation cycles for ALL cells (land + ocean)
	// Ocean cells use SST for freeze/melt, with a nominal precipitation
	// rate when freezing (1cm snow ≈ 10% ice cover per Pasta spec)
	for (let cycle = 0; cycle < cycles; cycle++) {
		let changed = false
		const isFinalYear = cycle === cycles - 1

		if (isFinalYear) {
			for (let r = 0; r < N; r++) {
				iceMin[r] = Infinity
				iceMax[r] = 0
			}
		}

		for (let m = 0; m < 12; m++) {
			const mOff = m * N
			const days = DAYS_PER_MONTH[m]
			for (let r = 0; r < N; r++) {
				const temp = climate.temperature_monthly[mOff + r]

				if (isLand[r]) {
					// Land: snow from precipitation
					if (temp < 0) {
						ice[r] += rainfall.monthly[mOff + r]
					} else if (ice[r] > 0) {
						const prev = ice[r]
						const melt = temp * days * MELT_FACTOR
						ice[r] = prev > melt ? prev - melt : 0
						if (ice[r] !== prev) changed = true
					}
				} else {
					// Ocean: sea ice forms when SST < -2°C
					// Coastal boost: raise freeze threshold and increase accumulation
					// Near coast: threshold up to +1°C (shallow water freezes easier)
					// Also accumulate more near coast (fast ice is thicker)
					const cb = coastBoost[r]
					const freezeThresh = -2 + cb * 3 // -2°C open ocean → +1°C at coast
					const accumRate = 10 + cb * 8     // 10mm open ocean → 18mm at coast

					if (temp < freezeThresh) {
						ice[r] += accumRate
					} else if (ice[r] > 0) {
						const prev = ice[r]
						// Melt proportional to how far above freeze threshold
						// Coastal ice melts slower (sheltered)
						const meltRate = 0.5 * (1 - cb * 0.4)
						const melt = Math.max(0, temp - freezeThresh) * days * meltRate
						ice[r] = prev > melt ? prev - melt : 0
						if (ice[r] !== prev) changed = true
					}
				}

				if (isFinalYear) {
					if (ice[r] < iceMin[r]) iceMin[r] = ice[r]
					if (ice[r] > iceMax[r]) iceMax[r] = ice[r]
				}
			}
		}

		if (cycle > 2 && !changed) {
			// Stabilized early — still need to record min/max for final year
			if (!isFinalYear) {
				for (let r = 0; r < N; r++) {
					iceMin[r] = Infinity
					iceMax[r] = 0
				}
				for (let m = 0; m < 12; m++) {
					const mOff = m * N
					const days = DAYS_PER_MONTH[m]
					for (let r = 0; r < N; r++) {
						const temp = climate.temperature_monthly[mOff + r]
						if (isLand[r]) {
							if (temp < 0) {
								ice[r] += rainfall.monthly[mOff + r]
							} else if (ice[r] > 0) {
								const melt = temp * days * MELT_FACTOR
								ice[r] = Math.max(0, ice[r] - melt)
							}
						} else {
							const cb = coastBoost[r]
							const freezeThresh = -2 + cb * 3
							const accumRate = 10 + cb * 8
							if (temp < freezeThresh) {
								ice[r] += accumRate
							} else if (ice[r] > 0) {
								const meltRate = 0.5 * (1 - cb * 0.4)
								const melt = Math.max(0, temp - freezeThresh) * days * meltRate
								ice[r] = Math.max(0, ice[r] - melt)
							}
						}
						if (ice[r] < iceMin[r]) iceMin[r] = ice[r]
						if (ice[r] > iceMax[r]) iceMax[r] = ice[r]
					}
				}
			}
			break
		}
	}

	// Clamp iceMin from Infinity to 0 for cells that never accumulated
	for (let r = 0; r < N; r++) {
		if (iceMin[r] === Infinity) iceMin[r] = 0
	}

	return { iceThickness: ice, iceMinMonthly: iceMin, iceMaxMonthly: iceMax }
}
