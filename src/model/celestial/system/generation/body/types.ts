import type { OrbitGroup } from "@/model/celestial/orbit-body/types"
import type { Zone } from "@/model/celestial/planet/types"
import type {
	LuminosityClass,
	SpectralClass,
} from "@/model/celestial/star/types"
import type { GenerateSystemBodiesParams } from "@/model/celestial/system/generation/types"
import type { RNG } from "@/model/shared/random/rng"

export type BodyGenerationParams = GenerateSystemBodiesParams

/** A belt-embedded resident's full physical/orbital roll -- shared by the
 * natural Ceres/Pallas-style belt dwarf loop and the protostar size-cap
 * cascade (World Builder's Handbook p. 224), which both need the same
 * "roll a small body and place it in a belt" pipeline at a different group/
 * sizeClass. */
export interface RollBeltResidentBodyInput {
	rng: ReturnType<typeof RNG.createRng>
	group: OrbitGroup
	sizeClass: number
	zone: Zone
	orbitalDistanceAU: number
	luminositySol: number
	spectralClass: SpectralClass
	/** [JUSTIFICATION] Only meaningful alongside spectralClass "NS" -- see
	 * PLANET.buildClassificationEnvironment's identical field. */
	luminosityClass?: LuminosityClass
	starAgeGyr: number
	starMassSol: number
	proto: boolean
	primordial: boolean
	/** [JUSTIFICATION] Only a size-cap cascade member (protostar p. 224 or
	 * primordial p. 226, both +2) or a primordial extra co-orbital planet
	 * (p. 226, +3) stacks an extra DM on top of the system-wide protostar/
	 * primordial DM -- a natural belt dwarf has no such extra DM. */
	extraEccentricityDM?: number
}

/** A young-system belt spawned to hold overflow -- either a protostar slot's
 * entire real content (World Builder's Handbook p. 224's co-located belts)
 * or a primordial slot's size-cap cascade overflow only (p. 226). Either
 * way, whatever the belt holds becomes a beltOfIdx-linked resident instead
 * of an independent top-level body (see RollBeltResidentBodyInput). */
export interface RollYouthBeltWrapperInput {
	rng: ReturnType<typeof RNG.createRng>
	zone: Zone
	deviation: number
	orbitalDistanceAU: number
	luminositySol: number
	spectralClass: SpectralClass
	/** [JUSTIFICATION] Only meaningful alongside spectralClass "NS" -- see
	 * PLANET.buildClassificationEnvironment's identical field. */
	luminosityClass?: LuminosityClass
	starAgeGyr: number
	/** [JUSTIFICATION] Only Stage 8 has a real system spread value to report --
	 * a legacy (non-Stage-8) belt falls back to the book's own substitute (2D
	 * x 0.1 Orbit#, p. 73) -- see ASTEROID_BELT.rollProfile's own identical
	 * field, forwarded straight through here. */
	spreadOrbitNumber?: number
	hasAdjacentGasGiant: boolean
	isOutermostOrbitSlot: boolean
	/** [JUSTIFICATION] See ASTEROID_BELT.rollProfile's identical field --
	 * forwarded straight through. Only true for a primordial cascade belt;
	 * a protostar wrapper belt omits it (protostar has no span-doubling
	 * rule of its own). */
	primordial?: boolean
}
