import { ECONOMY } from "@/model/history/sim/engine/economy"
import { DISPOSITION } from "@/model/history/sim/engine/events/diplomacy/disposition"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import type {
	EnthroneParams,
	SeeksParams,
	SeizeParams,
} from "@/model/history/sim/engine/events/succession/overthrow/types"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { RESTORATION } from "@/model/history/sim/engine/events/succession/restoration"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"

const THRONE_BACKING = 0.95
const THRONE_BID_CHANCE = 0.05

function seize({
	state,
	realm,
	person,
	claim,
	deposed,
	reason,
}: SeizeParams): void {
	STATE.installRuler({ state, p: realm, person, claim, reason })
	if (deposed >= 0) RESTORATION.depose({ state, realm, claimant: deposed })
	STATE.scheduleSuccession({ state, p: realm })
}

function seeks({ state, realm, holder, rng }: SeeksParams): number[] {
	const incumbent = state.people.rulerOf[realm]
	if (
		holder < 0 ||
		incumbent < 0 ||
		!SUCCESSION_SYSTEMS.adultAvailable({ state, person: holder })
	)
		return []
	const challenge = SUCCESSION_SYSTEMS.challenge({
		state,
		realm,
		incumbent,
		claimant: holder,
		rng,
	})
	return challenge.backed &&
		challenge.share >= THRONE_BACKING &&
		rng.random() < THRONE_BID_CHANCE
		? challenge.supportingSeats
		: []
}

function enthrone({
	state,
	war,
	claimant,
	claim,
	deposed,
	rng,
}: EnthroneParams): void {
	const realm = war.defender
	REGENCY.end({ state, realm, cause: "overthrown" })
	PEOPLE.vacate({
		people: state.people,
		seat: war.attacker,
		reason: "regime change",
	})
	seize({
		state,
		realm,
		person: claimant,
		claim,
		deposed,
		reason: "regime change",
	})
	STATE.considerTitles({
		state,
		nation: realm,
		rng,
		revenueOf: (nation) => ECONOMY.revenue({ state, p: nation }),
	})
	REGENCY.startMinority({ state, realm })
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
		data: { nation: realm, claimant, deposed, war: war.idx },
	})
}

export const OVERTHROW = { seize, seeks, enthrone }
