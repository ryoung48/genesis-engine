import type { createRng } from "@/model/shared/rng"
import type { MoonBody } from "../../../moons/types"
import type { OrbitGroup } from "../../../orbit-body/types"
import type { Zone } from "../../../planet/types"
import type { MainSequenceClass } from "../../../star/types"

export interface MoonPlacementInput {
	rng: ReturnType<typeof createRng>
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
