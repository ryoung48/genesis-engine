import type { OrbitGroup } from "@/model/celestial/orbit-body/types"
import type { Zone } from "@/model/celestial/planet/types"
import type { AnomalousOrbitType } from "@/model/celestial/system/generation/anomalous-orbits/types"

export interface Slot {
	zone: Zone
	deviation: number
	/** [JUSTIFICATION] Legacy callers still roll an environment-derived slot;
	 * Stage 8 supplies a final physical position instead. */
	orbitalDistanceAU?: number
	/** [JUSTIFICATION] Only Stage 8 has already selected a book-required
	 * world type; legacy slot generation still rolls its group. */
	groupHint?: OrbitGroup
	/** [JUSTIFICATION] Only Stage 7's trojan reservation creates a co-orbital
	 * body; legacy slots have exactly one body. */
	trojanCount?: number
	/** True for the single reserved deviation-0 inner slot -- see
	 * generateSystemBodies. */
	isMainWorld?: boolean
	/** [JUSTIFICATION] Only Stage 7's anomalous reservation sets this -- the
	 * book's Anomalous Orbit Type (p. 50-51), used to apply this slot's
	 * eccentricity DM and, for inclined/retrograde, its own inclination
	 * formula instead of the ordinary roll. A legacy (non-Stage-8) slot has
	 * no anomaly of its own. */
	anomalousOrbitType?: AnomalousOrbitType | null
	/** [JUSTIFICATION] Only Stage 8 has a real spread value to report -- the
	 * book's Significant Moon Quantity DM (p. 54) triggers when a slot is
	 * "within the spread distance" of a companion unavailability range, so
	 * this is what that adjacency check measures against. A legacy slot has
	 * no spread concept at all. */
	spreadOrbitNumber?: number
	/** [JUSTIFICATION] Only Stage 8 has a real ordered slot list to check
	 * neighbors against -- the book's Belt Span DM-1 (p. 73) triggers when the
	 * adjacent inner/outer orbital slot holds a gas giant. A legacy slot has
	 * no neighbor concept at all. */
	hasAdjacentGasGiant?: boolean
	/** [JUSTIFICATION] Only Stage 8 has a real ordered slot list to check
	 * position within -- the book's Belt Span DM+3 (p. 73) triggers when the
	 * belt occupies the system's outermost orbital slot. A legacy slot has no
	 * "outermost" concept at all. */
	isOutermostOrbitSlot?: boolean
}
