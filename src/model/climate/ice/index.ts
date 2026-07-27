import { meanEdgeLengthKm, TIME } from "@/model/shared"
import type {
	IceResult,
	ComputeIceAccumulationParams,
} from "@/model/climate/ice/types"

const MELT_FACTOR = 6.0

const DAYS_PER_MONTH = new Float64Array(12)

for (let m = 0; m < 12; m++) DAYS_PER_MONTH[m] = TIME.month.days(m).length

function computeIceAccumulation({
	mesh,
	climate,
	rainfall,
	isLand,
	distCoast,
	cycles = 15,
	planetRadiusKm,
}: ComputeIceAccumulationParams): IceResult {
	const N = mesh.numRegions
	const ice = new Float32Array(N)
	const iceMin = new Float32Array(N)
	const iceMax = new Float32Array(N)
	if (cycles <= 0) {
		return { iceThickness: ice, iceMinMonthly: iceMin, iceMaxMonthly: iceMax }
	}

	// Pre-compute coastal boost for ocean cells.
	// Near-coast ocean freezes easier (shallow water, land sheltering).
	// Boost fades over ~8 mesh-edge-lengths from coastline (distCoast is real
	// km — see computeCoastDistances — so this converts the old "~8 hops"
	// heuristic into an equivalent km distance rather than comparing hops
	// against km directly).
	const avgEdgeKm = meanEdgeLengthKm(mesh, planetRadiusKm)
	const COAST_FADE = 8 * avgEdgeKm
	const coastBoost = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		const d = distCoast[r]
		if (d < COAST_FADE) {
			coastBoost[r] = 1 - d / COAST_FADE // 1.0 at coast, 0 at fade distance
		}
	}

	const annualTotal = new Float32Array(N)
	const annualMinPrefix = new Float32Array(N)
	const landActive: number[] = []
	const oceanActive: number[] = []

	// Each year is a capped random walk: ice = max(0, ice + delta_month).
	// Pre-compute the per-cell annual transfer function once, then replay only
	// the final year to recover monthly min/max.
	for (let r = 0; r < N; r++) {
		let prefix = 0
		let minPrefix = 0
		let hasAccumulation = false

		if (isLand[r]) {
			for (let m = 0; m < 12; m++) {
				const mOff = m * N
				const temp = climate.temperature_monthly[mOff + r]

				if (temp < 0) {
					const accumulation = rainfall.monthly[mOff + r]
					prefix += accumulation
					hasAccumulation ||= accumulation > 0
				} else if (temp > 0) {
					prefix -= temp * DAYS_PER_MONTH[m] * MELT_FACTOR
				}

				if (prefix < minPrefix) minPrefix = prefix
			}

			if (hasAccumulation) landActive.push(r)
		} else {
			const cb = coastBoost[r]
			const freezeThresh = -2 + cb * 2
			const accumRate = 10 + cb * 5
			const meltRate = 0.5 * (1 - cb * 0.4)

			for (let m = 0; m < 12; m++) {
				const mOff = m * N
				const temp = climate.temperature_monthly[mOff + r]

				if (temp < freezeThresh) {
					prefix += accumRate
					hasAccumulation = true
				} else if (temp > freezeThresh) {
					prefix -= (temp - freezeThresh) * DAYS_PER_MONTH[m] * meltRate
				}

				if (prefix < minPrefix) minPrefix = prefix
			}

			if (hasAccumulation) oceanActive.push(r)
		}

		annualTotal[r] = prefix
		annualMinPrefix[r] = minPrefix
	}

	const finalYearCycles = cycles - 1

	for (let i = 0; i < landActive.length; i++) {
		const r = landActive[i]
		const total = annualTotal[r]
		const minPrefix = annualMinPrefix[r]
		const rebound = total - minPrefix
		let current =
			finalYearCycles <= 0
				? 0
				: total >= 0
					? rebound + (finalYearCycles - 1) * total
					: rebound

		let minValue = Infinity
		let maxValue = 0

		for (let m = 0; m < 12; m++) {
			const mOff = m * N
			const temp = climate.temperature_monthly[mOff + r]

			if (temp < 0) {
				current += rainfall.monthly[mOff + r]
			} else if (temp > 0 && current > 0) {
				const melt = temp * DAYS_PER_MONTH[m] * MELT_FACTOR
				current = current > melt ? current - melt : 0
			}

			if (current < minValue) minValue = current
			if (current > maxValue) maxValue = current
		}

		ice[r] = current
		iceMin[r] = minValue === Infinity ? 0 : minValue
		iceMax[r] = maxValue
	}

	for (let i = 0; i < oceanActive.length; i++) {
		const r = oceanActive[i]
		const total = annualTotal[r]
		const minPrefix = annualMinPrefix[r]
		const rebound = total - minPrefix
		let current =
			finalYearCycles <= 0
				? 0
				: total >= 0
					? rebound + (finalYearCycles - 1) * total
					: rebound

		const cb = coastBoost[r]
		const freezeThresh = -2 + cb * 2
		const accumRate = 10 + cb * 5
		const meltRate = 0.5 * (1 - cb * 0.4)
		let minValue = Infinity
		let maxValue = 0

		for (let m = 0; m < 12; m++) {
			const mOff = m * N
			const temp = climate.temperature_monthly[mOff + r]

			if (temp < freezeThresh) {
				current += accumRate
			} else if (temp > freezeThresh && current > 0) {
				const melt = (temp - freezeThresh) * DAYS_PER_MONTH[m] * meltRate
				current = current > melt ? current - melt : 0
			}

			if (current < minValue) minValue = current
			if (current > maxValue) maxValue = current
		}

		ice[r] = current
		iceMin[r] = minValue === Infinity ? 0 : minValue
		iceMax[r] = maxValue
	}

	return { iceThickness: ice, iceMinMonthly: iceMin, iceMaxMonthly: iceMax }
}

export const ICE = {
	computeIceAccumulation,
}
