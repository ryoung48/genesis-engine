import { DISPOSITION } from "@/model/history/sim/engine/events/diplomacy/disposition"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import { ACCESSION } from "@/model/history/sim/engine/events/succession/accession"
import type {
	EnthroneParams,
	StandsParams,
} from "@/model/history/sim/engine/events/succession/overthrow/types"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"

// A claim stands while both rulers are those it was pressed between.
function stands({ state, war }: StandsParams): boolean {
	return (
		state.leaderRuntime.rulerId[war.defender] === war.originalCrownRuler &&
		state.leaderRuntime.rulerId[war.attacker] === war.claimantRuler &&
		STATE.isSovereign({ state, p: war.attacker }) &&
		STATE.canUniteAfterWar({ state, a: war.defender, b: war.attacker })
	)
}

function enthrone({
	state,
	war,
	ruler,
	claim,
	union,
	rng,
}: EnthroneParams): void {
	const realm = war.defender
	const deposed = STATE_RULERS.has({ state, p: realm })
		? STATE_RULERS.ref({ state, ruler: STATE_RULERS.read({ state, p: realm }) })
		: null
	STATE_RULERS.endRegency({ state, realm, cause: "overthrown" })
	if (union)
		STATE.unite({ state, a: realm, b: war.attacker, ruler, claim, rng })
	else STATE.seatRuler({ state, p: realm, ruler, claim, natural: false, rng })
	ACCESSION.settle({
		state,
		realm,
		rng,
		elected: false,
		previousHouse: deposed?.dynasty ?? -1,
	})
	const overlord = STATE.diplomaticOverlord({ state, nation: realm })
	if (
		overlord >= 0 &&
		war.allies.has(overlord) &&
		!war.backers.includes(overlord)
	)
		VASSALAGE.release({
			state,
			vassal: realm,
			overlord,
			cause: "regime change",
		})
	else if (overlord >= 0 && !war.backers.includes(overlord))
		DISPOSITION.set({
			state,
			a: realm,
			b: overlord,
			value: STATE.disp.SUSPICIOUS,
			cause: "regime change",
		})
	state.events.push({
		tag: "regime change",
		time: state.time,
		data: {
			nation: realm,
			war: war.idx,
			...STATE_RULERS.noteFields({
				prefix: "claimant",
				ref: STATE_RULERS.ref({ state, ruler }),
			}),
			...(deposed
				? STATE_RULERS.noteFields({ prefix: "deposed", ref: deposed })
				: {}),
		},
	})
}

export const OVERTHROW = { stands, enthrone }
