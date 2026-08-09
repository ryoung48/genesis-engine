import type { Zone } from "@/model/celestial/planet/types"

export interface Slot {
	zone: Zone
	deviation: number
	/** True for the single reserved deviation-0 inner slot -- see
	 * generateSystemBodies. */
	isMainWorld?: boolean
}
