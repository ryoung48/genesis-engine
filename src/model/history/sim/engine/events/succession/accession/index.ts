import { ECONOMY } from "@/model/history/sim/engine/economy"
import type { SettleParams } from "@/model/history/sim/engine/events/succession/accession/types"
import { CORONATION } from "@/model/history/sim/engine/events/succession/coronation"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_GOVERNMENT } from "@/model/history/sim/engine/state/government"

// What follows any change of ruler once the throne is settled: the government
// reviews itself and the new ruler is crowned.
function settle({
	state,
	realm,
	rng,
	elected,
	previousHouse,
}: SettleParams): void {
	const transition = STATE_GOVERNMENT.accede({
		state,
		realm,
		provinces: STATE.getNationProvinces({ state, root: realm }),
		rng,
		knowledge: ECONOMY.realmKnowledge({ state, p: realm }),
		elected,
		previousHouse,
	})
	if (transition) STATE.reconcileGovernment({ state, realm, transition, rng })
	CORONATION.hold({ state, realm, rng })
}

export const ACCESSION = { settle }
