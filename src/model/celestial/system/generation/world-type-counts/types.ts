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
}

export interface WorldTypeCounts {
	gasGiantCount: number
	beltCount: number
	terrestrialCount: number
	totalWorlds: number
}
