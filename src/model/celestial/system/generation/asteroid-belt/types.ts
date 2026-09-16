import type { RNG } from "@/model/shared/random/rng"

export interface RollBeltProfileInput {
	rng: ReturnType<typeof RNG.createRng>
	orbitalDistanceAU: number
	luminositySol: number
	starAgeGyr: number
	/** [JUSTIFICATION] Only Stage 8 has a real system spread value to report --
	 * a legacy (non-Stage-8) belt falls back to the book's own substitute (2D
	 * x 0.1 Orbit#, p. 73). */
	spreadOrbitNumber?: number
	hasAdjacentGasGiant: boolean
	isOutermostOrbitSlot: boolean
}

export interface RollBeltSpanOrbitNumberInput {
	rng: ReturnType<typeof RNG.createRng>
	/** [JUSTIFICATION] Only Stage 8 has a real system spread value to report --
	 * a legacy (non-Stage-8) belt falls back to the book's own substitute (2D
	 * x 0.1 Orbit#, p. 73). */
	spreadOrbitNumber?: number
	hasAdjacentGasGiant: boolean
	isOutermostOrbitSlot: boolean
}

export interface RollBeltCompositionInput {
	rng: ReturnType<typeof RNG.createRng>
	orbitNumber: number
	hzcoOrbitNumber: number
}

export interface RollBeltBulkInput {
	rng: ReturnType<typeof RNG.createRng>
	starAgeGyr: number
	cTypePct: number
}

export interface RollBeltResourceRatingInput {
	rng: ReturnType<typeof RNG.createRng>
	bulk: number
	mTypePct: number
	cTypePct: number
}

export interface BeltCrossingInput {
	orbitalDistanceAU: number
	spanOrbitNumber: number
}

export interface CrossesAnyBeltInput {
	bodyOrbitalDistanceAU: number
	bodyEccentricity: number
	belts: BeltCrossingInput[]
}
