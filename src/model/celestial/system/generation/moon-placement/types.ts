import type { MoonBody } from "@/model/celestial/moons/types"
import type { OrbitGroup } from "@/model/celestial/orbit-body/types"
import type { Zone } from "@/model/celestial/planet/types"
import type { SpectralClass } from "@/model/celestial/star/types"
import { RNG } from "@/model/shared/random/rng"

export interface MoonPlacementInput {
	rng: ReturnType<typeof RNG.createRng>
	moonCount: number
	diameterKm: number
	parentSizeClass: number
	orbitalDistanceAU: number
	starMassKg: number
	group: OrbitGroup
	isPrimaryWorld: boolean
	zone: Zone
	deviation: number
	spectralClass: SpectralClass
	starAgeGyr: number
	luminositySol: number
	massKg: number
	moonSlotName: string
	nameBody: (slot: string) => string
	/** Inherited unchanged from the parent planet's own impactZone flag -- see
	 * PLANET.classifyBody's impactZone doc. */
	impactZone: boolean
}

export type MoonPlacementResult = MoonBody[]
