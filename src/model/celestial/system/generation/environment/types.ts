import type { Zone } from "../../../planet/types"

export interface Slot {
	zone: Zone
	deviation: number
	/** True for the single reserved deviation-0 inner slot when
	 * forceMainWorld is set -- see generateSystemBodies. */
	isMainWorld?: boolean
}
