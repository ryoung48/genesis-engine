import type { RNG } from "@/model/shared/random/rng"

export type DensityComposition = "ice" | "rocky" | "metallic"

export type EccentricityOrbitKind = "planet" | "companion-star"

export interface RollEccentricityInput {
	rng: ReturnType<typeof RNG.createRng>
	orbitKind: EccentricityOrbitKind
}
