import type {
	AtmosphereProfile,
	OrbitClassification,
	OrbitComposition,
} from "@/model/celestial/orbit-body/types"
import type { SpectralClass } from "@/model/celestial/star/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface DensityDescriptionInput {
	earthRelative: number
	classification: OrbitClassification
	/** [JUSTIFICATION] Only present for a procedurally-rolled body -- a
	 * hand-authored/real body (e.g. the Sol seed) has no rng and no roll to
	 * make, so it's simply never eligible for the rare Carbon override. */
	rng?: SharedRng
	/** [JUSTIFICATION] Only used to gate the rare Carbon override (excluded
	 * for O/B/A hosts) -- omitted entirely collapses to "never carbon", the
	 * same as any other non-eligible host. */
	hostSpectralClass?: SpectralClass
}

export interface DensityProfileInput {
	massKg: number
	diameterKm: number
	classification: OrbitClassification
	rng?: SharedRng
	hostSpectralClass?: SpectralClass
}

export interface RollAlbedoInput {
	rng: SharedRng
	composition: OrbitComposition
	atmosphere: AtmosphereProfile | null
	hydrosphereCode: number
}
