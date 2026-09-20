import type {
	AtmosphereProfile,
	OrbitClassification,
} from "@/model/celestial/orbit-body/types"
import type {
	LuminosityClass,
	SpectralClass,
} from "@/model/celestial/star/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RollAtmosphereInput {
	rng: SharedRng
	profile: Pick<AtmosphereProfile, "type" | "subtype" | "unusual">
	panthalassic: boolean
}

export interface RollHazardInput {
	rng: SharedRng
	profile: Pick<AtmosphereProfile, "type" | "subtype">
	starAgeGyr: number
}

export interface AtmosphereCodeInput {
	rng: SharedRng
	atmosphereCode: number
	params: {
		chemistry: string
		sizeClass: number
		deviation: number
		hydrosphereCode: number
		gravityG: number
		classification: OrbitClassification
		isPrimaryWorld: boolean
		/** Drives rollHazard's "lifeless" branch (a young system's tainted
		 * atmosphere can't have produced a biologic hazard yet). */
		starAgeGyr: number
		/** Book p. 228: "all planets in orbit around a pulsar or magnetar have
		 * the radioactive taint or irritant... in addition to any other
		 * taints or irritants" -- forces hazard "radioactive" (and tainted)
		 * on top of whatever the normal roll produced when
		 * STAR.isPulsar/isMagnetar is true for these. */
		starSpectralClass: SpectralClass
		starLuminosityClass: LuminosityClass
	}
}
