import type { Zone } from "@/model/celestial/planet/types"
import type {
	AnomalousOrbitReservation,
	AnomalousOrbitType,
} from "@/model/celestial/system/generation/anomalous-orbits/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type OrbitSlotType = "empty" | "gas-giant" | "belt" | "terrestrial"

export interface OrbitSlot {
	orbitNumber: number
	type: OrbitSlotType
	anomalousOrbitType: AnomalousOrbitType | null
	trojanCount: number
	isBaseline: boolean
	orbitalDistanceAU: number | null
	deviation: number | null
	zone: Zone | null
	/** The actual spread value (book p. 49, post exclusion-zone growth) that
	 * placed this slot -- the book's Significant Moon Quantity DM (p. 54)
	 * triggers when a slot lies "within the spread distance" of a companion
	 * unavailability range, so this is what "adjacent" is measured against
	 * rather than a fixed approximation. An anomalous/trojan slot (placed
	 * off the regular grid) borrows the nearest regular slot's spread, since
	 * it has none of its own. */
	spreadOrbitNumber: number
}

export interface RandomOrbitInput {
	rng: SharedRng
	minimumOrbitNumber: number
	maximumOrbitNumber: number
}

// A companion star's own min/max separation band (p. 38-39): a regular
// slot can't be placed inside it, and the book has the walk grow its
// spread by the zone's width rather than skip past it silently.
export interface OrbitExclusionZone {
	minOrbitNumber: number
	maxOrbitNumber: number
}

export interface RegularSlotInput {
	rng: SharedRng
	baselineNumber: number | null
	baselineOrbitNumber: number | null
	totalWorlds: number
	minimumOrbitNumber: number
	maximumOrbitNumber: number
	exclusionZones: OrbitExclusionZone[]
}

export interface WalkFromAnchorInput {
	rng: SharedRng
	anchorOrbitNumber: number
	stepCount: number
	nominalSpread: number
	direction: 1 | -1
	boundaryOrbitNumber: number
	exclusionZones: OrbitExclusionZone[]
}

export interface OrbitTypeAssignmentInput {
	slots: OrbitSlot[]
	type: OrbitSlotType
	count: number
	rng: SharedRng
}

export interface OrbitPlacementInput {
	rng: SharedRng
	baselineNumber: number | null
	baselineOrbitNumber: number | null
	totalWorlds: number
	gasGiantCount: number
	beltCount: number
	terrestrialCount: number
	emptyOrbitCount: number
	anomalousOrbitReservations: AnomalousOrbitReservation[]
	minimumOrbitNumber: number
	maximumOrbitNumber: number
	exclusionZones: OrbitExclusionZone[]
}
