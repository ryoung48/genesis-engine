import type { ChanceParams } from "@/model/history/sim/engine/events/diplomacy/formation/types"

// User-requested halving of starting ties and ongoing diplomatic formation.
const FORMATION_SCALE = 0.5

const ALLIANCE_SCALE = 0.35

function chance({ base }: ChanceParams): number {
	return base * FORMATION_SCALE
}

function allianceChance({ base }: ChanceParams): number {
	return chance({ base }) * ALLIANCE_SCALE
}

export const DIPLOMATIC_FORMATION = {
	chance,
	allianceChance,
	allianceScale: ALLIANCE_SCALE,
}
