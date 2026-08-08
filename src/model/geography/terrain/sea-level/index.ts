import { ELEVATION } from "@/model/geography/terrain/elevation"
import type {
	ComputeSeaLevelOffsetKmParams,
	HeightKmToElevParams,
} from "@/model/geography/terrain/sea-level/types"

function computeSeaLevelOffsetKm({
	seaLevel,
	maxDepthKm,
}: ComputeSeaLevelOffsetKmParams): number {
	if (seaLevel === 1) return 0
	if (seaLevel < 1) return -(1 - seaLevel) * maxDepthKm
	return (seaLevel - 1) * maxDepthKm
}

function heightKmToElev({
	heightKm,
	maxElevKm = 6,
	maxDepthKm = 10,
}: HeightKmToElevParams): number {
	if (heightKm <= 0) return heightKm / maxDepthKm
	if (maxElevKm <= 0) return 0
	if (heightKm >= maxElevKm) return 1

	let lo = 0
	let hi = 1
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) * 0.5
		const midHeight = ELEVATION.elevToHeightKm({
			elev: mid,
			maxElevKm,
			maxDepthKm,
		})
		if (midHeight < heightKm) lo = mid
		else hi = mid
	}
	return (lo + hi) * 0.5
}

function applySeaLevelToElevation(params: {
	baseElevation: Float32Array
	maxElevKm: number
	maxDepthKm: number
	seaLevel: number
}): {
	elevation: Float32Array
	elevation_km: Float32Array
	seaLevelOffsetKm: number
} {
	const { baseElevation, maxElevKm, maxDepthKm, seaLevel } = params
	const seaLevelOffsetKm = computeSeaLevelOffsetKm({ seaLevel, maxDepthKm })
	if (seaLevelOffsetKm === 0) {
		const elevation_km = new Float32Array(baseElevation.length)
		for (let r = 0; r < baseElevation.length; r++) {
			elevation_km[r] = ELEVATION.elevToHeightKm({
				elev: baseElevation[r],
				maxElevKm,
				maxDepthKm,
			})
		}
		return {
			elevation: baseElevation,
			elevation_km,
			seaLevelOffsetKm,
		}
	}

	const elevation = new Float32Array(baseElevation.length)
	const elevation_km = new Float32Array(baseElevation.length)
	for (let r = 0; r < baseElevation.length; r++) {
		const adjustedHeightKm =
			ELEVATION.elevToHeightKm({
				elev: baseElevation[r],
				maxElevKm,
				maxDepthKm,
			}) - seaLevelOffsetKm
		elevation_km[r] = adjustedHeightKm
		elevation[r] = heightKmToElev({
			heightKm: adjustedHeightKm,
			maxElevKm,
			maxDepthKm,
		})
	}

	return {
		elevation,
		elevation_km,
		seaLevelOffsetKm,
	}
}

export const SEA_LEVEL = {
	computeSeaLevelOffsetKm,
	applySeaLevelToElevation,
}
