import type { SharedRng } from "@/model/shared/random/rng"

export type AnomalousOrbitType =
	| "random"
	| "eccentric"
	| "inclined"
	| "retrograde"
	| "trojan"

export type AnomalousWorldType = "terrestrial" | "belt"

export interface AnomalousOrbitReservation {
	type: AnomalousOrbitType
	worldType: AnomalousWorldType
	starIndex: number
}

export interface AnomalousOrbitRollInput {
	// [JUSTIFICATION] Only fitted regions restrict which anomaly rolls can be reserved.
	circularCoplanar?: boolean
	rng: SharedRng
	terrestrialCount: number
	eligibleStarIndices: number[]
}
