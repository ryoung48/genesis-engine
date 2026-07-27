import type {
	AtmosphereProfile,
	OrbitClassification,
	OrbitComposition,
} from "@/model/celestial/orbit-body/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface DensityDescriptionInput {
	earthRelative: number
	classification: OrbitClassification
}

export interface DensityProfileInput {
	massKg: number
	diameterKm: number
	classification: OrbitClassification
}

export interface RollAlbedoInput {
	rng: SharedRng
	composition: OrbitComposition
	atmosphere: AtmosphereProfile | null
	hydrosphereCode: number
}
