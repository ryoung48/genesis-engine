// Systems can now range from 50 to 200,000 (see GalaxyGenerationPanel's
// Systems editor). Fixed-pixel star points, hyperlane thickness, and the
// hover ring were tuned for the old ~4,000-system default -- a 200k galaxy
// packs 50x as many points into the same view, so those same fixed sizes
// would read as an unreadable solid mass, while a sparse 50-system galaxy
// would look anemic at the old sizes. Scale everything by the sqrt of how
// far numSystems sits from that reference point (sqrt rather than linear,
// since screen-space crowding grows with point count while each point's
// footprint only needs to shrink enough to compensate, not match 1:1) and
// clamp so neither extreme collapses to invisible or blows out the view.
const REFERENCE_SYSTEM_COUNT = 4000
export const DENSE_GALAXY_SYSTEM_COUNT = 2000
const MIN_SCALE = 0.35
const MAX_SCALE = 2.5

export function computeGalaxyDensityScale(numSystems: number): number {
	if (numSystems <= 0) return MAX_SCALE
	const raw = Math.sqrt(REFERENCE_SYSTEM_COUNT / numSystems)
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw))
}

/** Reduces companion-star spacing only once a galaxy has enough systems for
 * its map to become visually crowded. */
export function computeClusterDensityScale(numSystems: number): number {
	if (numSystems <= 0) return 1
	return Math.min(1, Math.sqrt(DENSE_GALAXY_SYSTEM_COUNT / numSystems))
}
