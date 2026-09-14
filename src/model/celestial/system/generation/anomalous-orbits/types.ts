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
	rng: SharedRng
	terrestrialCount: number
	eligibleStarIndices: number[]
}
