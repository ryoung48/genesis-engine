function elevToHeightKm(args: {
	elev: number
	maxElevKm?: number
	maxDepthKm?: number
}): number {
	const { elev, maxElevKm = 6, maxDepthKm = 10 } = args
	if (elev <= 0) return elev * maxDepthKm
	const t = Math.min(elev, 1)
	const t2 = t * t
	return maxElevKm * t2 * t2 * (5 - 4 * t)
}

export const ELEVATION = {
	elevToHeightKm,
}
