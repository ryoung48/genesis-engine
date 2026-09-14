import type {
	AtmosphereProfile,
	BiosphereProfile,
	OrbitClassification,
} from "@/model/celestial/orbit-body/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type { BiosphereProfile }

export interface BiosphereInput {
	rng: SharedRng
	starAgeGyr: number
	/** Null/undefined (e.g. an asteroid belt) is treated as vacuum (code 0). */
	atmosphere?: AtmosphereProfile | null
	temperatureMeanK: number
	temperatureHighK: number
	temperatureLowK: number
	hydrosphereCode?: number
	classification: OrbitClassification
	impactZone?: boolean
	isMainWorld?: boolean
}

export interface BiosphereResult {
	biosphere: BiosphereProfile
	/** Set only when a hostile biosphere converts a breathable atmosphere to
	 * exotic (galaxy-gen's "breathable converted to exotic" mutation) -- the
	 * caller should apply this in place of the original atmosphere. */
	atmosphere?: AtmosphereProfile
}
