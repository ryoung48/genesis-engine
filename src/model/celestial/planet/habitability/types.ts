import type {
	AtmosphereProfile,
	BiosphereProfile,
} from "@/model/celestial/orbit-body/types"

export type { BiosphereProfile as HabitabilityProfile }

export interface HabitabilityInput {
	sizeClass: number
	// [JUSTIFICATION] Vacuum bodies carry no profile; absent counts as code 0.
	atmosphere?: AtmosphereProfile | null
	hydrosphereCode: number
	temperatureMeanK: number
	temperatureHighK: number
	temperatureLowK: number
	// [JUSTIFICATION] Book's undefined-gravity DM applies when gravity was never computed.
	gravityG?: number
	// [JUSTIFICATION] Only star locks penalize; absent means not star-locked.
	tideLockedToStar?: boolean
	seismologyTotal: number
	surfaceTidesHeating: number
	/** True when this body (or, for a moon, its parent planet) crosses a
	 * planetoid belt -- see ASTEROID_BELT.crossesAnyBelt. Not a World
	 * Builder's Handbook mechanic. */
	asteroidImpacts?: boolean
}
