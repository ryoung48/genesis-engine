import { elevToHeightKm } from "../climate/climate"

export function computeSeaLevelOffsetKm(
	seaLevel: number,
	maxElevKm: number,
	maxDepthKm: number,
): number {
	if (seaLevel === 1) return 0
	if (seaLevel < 1) return -(1 - seaLevel) * maxDepthKm
	return (seaLevel - 1) * maxDepthKm
}

export function heightKmToElev(
	heightKm: number,
	maxElevKm = 6,
	maxDepthKm = 10,
): number {
	if (heightKm <= 0) return heightKm / maxDepthKm
	if (maxElevKm <= 0) return 0
	if (heightKm >= maxElevKm) return 1

	let lo = 0
	let hi = 1
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) * 0.5
		const midHeight = elevToHeightKm(mid, maxElevKm, maxDepthKm)
		if (midHeight < heightKm) lo = mid
		else hi = mid
	}
	return (lo + hi) * 0.5
}

export function applySeaLevelToElevation(params: {
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
	const seaLevelOffsetKm = computeSeaLevelOffsetKm(
		seaLevel,
		maxElevKm,
		maxDepthKm,
	)
	if (seaLevelOffsetKm === 0) {
		const elevation_km = new Float32Array(baseElevation.length)
		for (let r = 0; r < baseElevation.length; r++) {
			elevation_km[r] = elevToHeightKm(baseElevation[r], maxElevKm, maxDepthKm)
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
			elevToHeightKm(baseElevation[r], maxElevKm, maxDepthKm) - seaLevelOffsetKm
		elevation_km[r] = adjustedHeightKm
		elevation[r] = heightKmToElev(adjustedHeightKm, maxElevKm, maxDepthKm)
	}

	return {
		elevation,
		elevation_km,
		seaLevelOffsetKm,
	}
}
