import type {
	AtmosphereProfile,
	OrbitClassification,
} from "@/model/celestial/orbit-body/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RollAtmosphereInput {
	rng: SharedRng
	profile: Pick<AtmosphereProfile, "type" | "subtype">
	panthalassic: boolean
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
	}
}
