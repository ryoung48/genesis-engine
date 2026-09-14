import type {
	LuminosityClass,
	SpectralClass,
} from "@/model/celestial/star/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface BaselineNumberInput {
	totalWorlds: number
	otherStarCount: number
	hasEpistellarCompanion: boolean
	hostSpectralClass: SpectralClass
	hostLuminosityClass: LuminosityClass
}

export interface BaselineNumberRollInput extends BaselineNumberInput {
	rng: SharedRng
}
