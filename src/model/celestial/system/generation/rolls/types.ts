import type { OrbitGroup } from "@/model/celestial/orbit-body/types"
import type { RNG } from "@/model/shared/random/rng"

export type DensityComposition = "ice" | "rocky" | "metallic"

export type EccentricityOrbitKind = "planet" | "companion-star"

export interface RollEccentricityInput {
	rng: ReturnType<typeof RNG.createRng>
	orbitKind: EccentricityOrbitKind
}

export interface RollPlanetRingsInput {
	rng: ReturnType<typeof RNG.createRng>
	group: OrbitGroup
}
