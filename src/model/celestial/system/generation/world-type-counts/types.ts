import type {
	LuminosityClass,
	SpectralClass,
} from "@/model/celestial/star/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface WorldTypeCountsInput {
	rng: SharedRng
	primarySpectralClass: SpectralClass
	primaryLuminosityClass: LuminosityClass
	primaryMassSol: number
	primaryAgeGyr: number
	isLoneStar: boolean
	systemPostStellarCount: number
	systemStarCount: number
	/** [JUSTIFICATION] Only meaningful alongside a dead-star primary -- the
	 * book's Dead Star Planetary System existence gate (p. 228) needs "is a
	 * neutron star/pulsar/magnetar present anywhere in the system," not just
	 * the primary's own class. Every other caller (a non-dead-star primary
	 * never consults this gate) can pass either value with no effect. */
	systemHasNeutronStar: boolean
	/** [JUSTIFICATION] See systemHasNeutronStar's identical doc -- the same
	 * gate's DM-4 "black hole present" clause. */
	systemHasBlackHole: boolean
}

export interface WorldTypeCounts {
	gasGiantCount: number
	beltCount: number
	terrestrialCount: number
	totalWorlds: number
}
