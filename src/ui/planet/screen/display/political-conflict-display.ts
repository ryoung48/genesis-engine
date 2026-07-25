/**
 * Active war shape shared by the map-coloring layer and the earth-history
 * adapter (see model/earth/history/adapter.ts).
 *
 * The occupation-overlay, rebel-recoloring and culture-blend helpers that used
 * to live here were driven by the procedural history sim's war and
 * culture-spread events. Those no longer exist; Earth import renders its own
 * occupation overlay via computeEarthHistoryOccupationOverlay.
 */
export interface PoliticalMapWar {
	idx: number
	attacker: number
	defender: number
	rebel: boolean
	occupied: number[]
}
