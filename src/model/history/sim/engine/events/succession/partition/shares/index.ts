import type { OccupiedShareParams } from "@/model/history/sim/engine/events/succession/partition/shares/types"
import { STATE } from "@/model/history/sim/engine/state"

function occupied({ state, seat }: OccupiedShareParams): boolean {
	return STATE.getNationProvinces({ state, root: seat }).some(
		(p) => state.occupationCurrent[p] >= 0,
	)
}

export const PARTITION_SHARES = { occupied }
