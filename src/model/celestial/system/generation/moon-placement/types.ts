import type { MoonBody } from "@/model/celestial/moons/types"
import type { OrbitGroup } from "@/model/celestial/orbit-body/types"
import type { Zone } from "@/model/celestial/planet/types"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { RNG } from "@/model/shared/rng"

export interface MoonPlacementInput {
	rng: ReturnType<typeof RNG.createRng>
	moonCount: number
	diameterKm: number
	orbitalDistanceAU: number
	starMassKg: number
	group: OrbitGroup
	isPrimaryWorld: boolean
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	starAgeGyr: number
	massKg: number
	moonSlotName: string
	nameBody: (slot: string) => string
}

export type MoonPlacementResult = MoonBody[]
