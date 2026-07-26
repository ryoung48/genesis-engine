/** Convert raw mesh elevation to physical height in km.
 *  maxElevKm controls peak mountain height (default 6, Earth-like).
 *  maxDepthKm controls ocean floor depth at elev=-1 (default 10). */
export function elevToHeightKm(args: {
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
