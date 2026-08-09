import type {
	AtmosphereProfile,
	BiosphereProfile,
} from "@/model/celestial/orbit-body/types"

export type { BiosphereProfile as HabitabilityProfile }

export interface HabitabilityInput {
	sizeClass: number
	atmosphere?: AtmosphereProfile | null
	hydrosphereCode: number
	temperatureMeanK: number
	temperatureHighK: number
	temperatureLowK: number
	gravityG: number
	/** Set only when tide-locked to the star -- a locked moon/planet's own
	 * lock (to a moon or to its parent planet) doesn't count, mirroring
	 * galaxy-gen's `orbit.lock?.type === "star"` check. */
	tideLockedToStar?: boolean
	/** Total seismic heating (residual + tidal + surface tides) -- galaxy-gen's
	 * SEISMOLOGY.total. */
	seismologyTotal: number
	/** Theoretical-max equilibrium surface tide -- stands in for galaxy-gen's
	 * tides.stress (sum of per-moon tidal effect), which chaos-machine has no
	 * equivalent list for. */
	surfaceTidesHeating: number
}
