import type { ChanceParams } from "@/model/history/sim/engine/events/diplomacy/formation/types"

// User-requested halving of starting ties and ongoing diplomatic formation.
const FORMATION_SCALE = 0.5

function chance({ base }: ChanceParams): number {
	return base * FORMATION_SCALE
}

export const DIPLOMATIC_FORMATION = { chance }
