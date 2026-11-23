import { HEIGHT_SCALE } from "@/model/geography/terrain/height-scale"
import type { ComputeSeaLevelOffsetKmParams } from "@/model/geography/terrain/sea-level/types"

function computeSeaLevelOffsetKm({
	seaLevel,
	maxDepthKm,
}: ComputeSeaLevelOffsetKmParams): number {
	if (seaLevel === 1) return 0
	if (seaLevel < 1) return -(1 - seaLevel) * maxDepthKm
	return (seaLevel - 1) * maxDepthKm
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
			elevation_km[r] = HEIGHT_SCALE.elevToHeightKm({
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
			HEIGHT_SCALE.elevToHeightKm({
				elev: baseElevation[r],
				maxElevKm,
				maxDepthKm,
			}) - seaLevelOffsetKm
		elevation_km[r] = adjustedHeightKm
		elevation[r] = HEIGHT_SCALE.heightKmToElev({
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
