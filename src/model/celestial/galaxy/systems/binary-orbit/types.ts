import type { StarPreview } from "@/model/celestial/galaxy/systems/types"
import type { OrbitCenter } from "@/model/celestial/orbit-body/types"

export interface BinaryComponent {
	center: OrbitCenter
	massSol: number
}

export interface BinaryOrbit {
	a: BinaryComponent
	b: BinaryComponent
	orbitalDistanceAU: number
	eccentricity: number
	inclinationDeg: number
	orbitalPeriodDays: number
}

export interface StabilityFit {
	orbitalDistanceAU: number
	eccentricity: number
	massRatio: number
}

export interface OuterSpacingInput {
	innerAxisAU: number
	eccentricity: number
	massRatio: number
}

export interface AxisRoundingInput {
	axisAU: number
	floorAU: number
}

export interface PlanetaryRegionsInput {
	stars: StarPreview[]
	orbits: BinaryOrbit[]
}
