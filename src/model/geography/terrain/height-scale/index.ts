import type {
	ElevDeltaKmParams,
	ElevToHeightKmParams,
	HeightKmToElevParams,
} from "@/model/geography/terrain/height-scale/types"

function elevToHeightKm({
	elev,
	maxElevKm,
	maxDepthKm,
}: ElevToHeightKmParams): number {
	if (elev <= 0) return elev * maxDepthKm
	const t = Math.min(elev, 1)
	const t2 = t * t
	return maxElevKm * t2 * t2 * (5 - 4 * t)
}

function heightKmToElev({
	heightKm,
	maxElevKm,
	maxDepthKm,
}: HeightKmToElevParams): number {
	if (heightKm <= 0) return heightKm / maxDepthKm
	if (maxElevKm <= 0) return 0
	if (heightKm >= maxElevKm) return 1

	let lo = 0
	let hi = 1
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) * 0.5
		const midHeight = elevToHeightKm({ elev: mid, maxElevKm, maxDepthKm })
		if (midHeight < heightKm) lo = mid
		else hi = mid
	}
	return (lo + hi) * 0.5
}

function elevDeltaKm({
	elev,
	delta,
	maxElevKm,
	maxDepthKm,
}: ElevDeltaKmParams): number {
	if (!(delta > 0)) return 0
	return (
		elevToHeightKm({ elev, maxElevKm, maxDepthKm }) -
		elevToHeightKm({ elev: Math.max(0, elev - delta), maxElevKm, maxDepthKm })
	)
}

export const HEIGHT_SCALE = { elevToHeightKm, heightKmToElev, elevDeltaKm }
