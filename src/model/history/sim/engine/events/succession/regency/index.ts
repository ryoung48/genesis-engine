import { CORONATION } from "@/model/history/sim/engine/events/succession/coronation"
import type {
	ComeOfAgeParams,
	RealmRegencyParams,
} from "@/model/history/sim/engine/events/succession/regency/types"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"

const WEAK_CROWN_LAXITY = 0.1

// A realm under a regency has a weak crown: its districts rebel more easily
// and it starts no wars.
function weak({ state, realm }: RealmRegencyParams): boolean {
	return state.regency[realm] === 1
}

// A ruler who reaches sixteen governs for themselves and is crowned if the
// accession was deferred. A ruler replaced or dead by then leaves the event
// stale.
function comeOfAge({ state, realm, leader, rng }: ComeOfAgeParams): void {
	if (
		state.leaderRuntime.idx[realm] !== leader ||
		!STATE.isSovereign({ state, p: realm })
	)
		return
	if (!state.regency[realm]) return
	STATE_RULERS.endRegency({ state, realm, cause: "age" })
	CORONATION.holdDeferred({ state, realm, leader, rng })
}

export const REGENCY = {
	weak,
	laxity: WEAK_CROWN_LAXITY,
	comeOfAge,
}
