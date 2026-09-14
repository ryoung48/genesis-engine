import type { AnomalousOrbitReservation } from "@/model/celestial/system/generation/anomalous-orbits/types"
import type { OrbitSlot } from "@/model/celestial/system/generation/orbit-placement/types"
import type { WorldTypeCounts } from "@/model/celestial/system/generation/world-type-counts/types"

export interface WorldTypeAllocationStar {
	orbitalDistanceAU: number
	mao: number
	maxOrbitalDistanceAU: number
	acceptsBodies: boolean
}

export interface WorldTypeAllocationInput {
	worldTypeCounts: WorldTypeCounts
	stars: WorldTypeAllocationStar[]
}

export interface WorldTypeAllocation {
	starCapacity: number
	gasGiantCount: number
	beltCount: number
	terrestrialCount: number
	emptyOrbitCount: number
	anomalousOrbitReservations: AnomalousOrbitReservation[]
	orbitSlots: OrbitSlot[]
	baselineNumber: number | null
	baselineOrbitNumber: number | null
	totalWorlds: number
}

export interface AllocationCountInput {
	totalCount: number
	starCapacityByIndex: number[]
	eligibleIndices: number[]
}
