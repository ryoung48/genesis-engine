import type { SharedRng } from "@/model/shared/rng"
import type {
	AtmosphereProfile,
	OrbitClassification,
	OrbitComposition,
} from "../../../orbit-body"

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
