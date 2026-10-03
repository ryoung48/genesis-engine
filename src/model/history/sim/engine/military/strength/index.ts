import type { StrengthParams } from "@/model/history/sim/engine/military/strength/types"

function of({ levy, regular }: StrengthParams): number {
	return 0.75 * levy + regular
}

export const ARMY_STRENGTH = { of }
