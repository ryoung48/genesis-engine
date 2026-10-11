import type { PatricianParams } from "@/model/history/sim/engine/events/people/patricians/types"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_PATRICIANS } from "@/model/history/sim/engine/state/patricians"

function settle({ state, rng, found }: PatricianParams): void {
	const realms = new Set(state.people.patricians.keys())
	for (let realm = 0; realm < state.P; realm++) {
		if (state.people.rulerOf[realm] >= 0) realms.add(realm)
	}
	for (const realm of realms)
		STATE_PATRICIANS.settleRealm({
			state,
			realm,
			sovereign: STATE.isSovereign({ state, p: realm }),
			origin: STATE.originOf({ state, realm }),
			time: state.time / STATE.yearMs,
			rng,
			found,
		})
}

export const PATRICIANS = { settle }
