import type { SharedRng } from "@/model/shared/random/rng"

export interface BaselineOrbitRollInput {
	rng: SharedRng
	baselineNumber: number | null
	totalWorlds: number
	habitableZoneOrbitNumber: number
	minimumOrbitNumber: number
	maximumOrbitNumber: number
}

export interface AvailableOrbitResolutionInput {
	rng: SharedRng
	orbitNumber: number
	minimumOrbitNumber: number
	maximumOrbitNumber: number
}
