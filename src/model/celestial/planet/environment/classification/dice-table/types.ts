import type {
	OrbitChemistry,
	OrbitComposition,
} from "@/model/celestial/orbit-body/types"
import type { Zone } from "@/model/celestial/planet/types"
import type { SharedRng } from "@/model/shared/rng"

export interface ChooseChemistryInput {
	rng: SharedRng
	zone: Zone
	primary: boolean
	chemMod: number
	waterMax: number
}

export interface ClassifiedEnvironment {
	atmosphereCode: number
	hydrosphereCode: number
	composition: OrbitComposition
	/** Unset when this classification has no volatile-chemistry variant. */
	chemistry?: OrbitChemistry
	/** Unset when the classification table does not define a named subtype. */
	subtype?: string
	/** Set only for classifications whose table requires an eccentric orbit. */
	eccentric?: boolean
}
