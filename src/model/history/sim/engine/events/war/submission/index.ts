import type { OfferParams } from "@/model/history/sim/engine/events/war/submission/types"
import { STATE } from "@/model/history/sim/engine/state"

const SUBMISSION_THREAT = 0.05
const SUBMISSION_CHANCE = 0.25

// A realm facing a hopeless war may yield its crown before the war starts.
function offer({
	state,
	attacker,
	defender,
	threat,
	rng,
}: OfferParams): boolean {
	if (threat >= SUBMISSION_THREAT || rng.random() >= SUBMISSION_CHANCE)
		return false
	const provinces = STATE.getNationProvinces({ state, root: defender })
	STATE.releaseSubjectRelations({ state, nation: defender })
	state.events.push({
		tag: "peaceful annexation",
		time: state.time,
		data: { attacker, defender, provinces },
	})
	STATE.repartitionNation({ state, nation: attacker, subjects: provinces })
	return true
}

export const SUBMISSION = {
	offer,
}
