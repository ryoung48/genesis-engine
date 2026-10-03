import { BATTLE_KIND } from "@/model/history/sim/engine/events/battle/kind"
import type {
	Siege,
	SiegeParams,
} from "@/model/history/sim/engine/events/siege/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { DEPLOYMENTS } from "@/model/history/sim/engine/military/deployments"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { ARMY_STRENGTH } from "@/model/history/sim/engine/military/strength"
import type { CoalitionMember } from "@/model/history/sim/engine/military/types"

const SIEGE_GARRISON_DESTROYED = 1

import type {
	LossParams,
	PartyParams,
	PrepareParams,
} from "@/model/history/sim/engine/events/siege/troops/types"

export const SIEGE_TROOPS = {
	garrisonOf,
	besiegersOf,
	defenderOf,
	prepare,
	lose,
	party,
	empty,
}
function empty(members: CoalitionMember[]): boolean {
	return MILITARY.totalTroops(members) < SIEGE_GARRISON_DESTROYED
}

function garrisonOf(siege: Siege): CoalitionMember[] {
	return Object.entries(siege.garrison).map(([nation, men]) => ({
		nation: Number(nation),
		...men,
		force: ARMY_STRENGTH.of(men),
	}))
}

function besiegersOf({ state, war, siege }: SiegeParams): CoalitionMember[] {
	return MILITARY.coalition({
		state,
		war,
		side: siege.besiegerSide,
		excluded: {},
	}).members
}

function defenderOf({ war, siege }: SiegeParams): number {
	return siege.besiegerSide === "attacker" ? war.defender : war.attacker
}

function prepare({
	state,
	war,
	attacker,
	province,
}: PrepareParams): Siege | null {
	if (!BATTLE_KIND.isTown({ state, province })) return null
	const besiegerSide = attacker === war.attacker ? "attacker" : "defender"
	const defendingSide = besiegerSide === "attacker" ? "defender" : "attacker"
	const defender = defendingSide === "attacker" ? war.attacker : war.defender
	const members = DEPLOYMENTS.sideMembers({
		state,
		war,
		side: defendingSide,
	}).map((nation) => {
		const men = war.deployed[nation] ?? { levy: 0, regular: 0 }
		return { nation, ...men, force: ARMY_STRENGTH.of(men) }
	})
	const total = MILITARY.totalTroops(members)
	const size = Math.min(
		RECRUITMENT.realmTargets({ state, nation: defender }).levyEligibility *
			FIELDS.prov.population.urban.get({ state, p: province }),
		SIEGE_GARRISON_FIELD_CAP * total,
	)
	if (size < SIEGE_GARRISON_DESTROYED || war.siege !== null) return null
	const garrison = MILITARY.casualties({ members, losses: size })
	const besiegers = MILITARY.coalition({
		state,
		war,
		side: besiegerSide,
		excluded: {},
	}).members
	const siege: Siege = {
		province,
		startTime: state.time,
		phase: 0,
		besieger: attacker,
		besiegerSide,
		startBesiegerStrength: MILITARY.totalForce(besiegers),
		garrison,
		startGarrison: size,
		shortages: [],
		breaches: 0,
	}
	return MILITARY.totalForce(besiegers) > MILITARY.totalForce(garrisonOf(siege))
		? siege
		: null
}

function lose({
	state,
	war,
	siege,
	members,
	losses,
	garrison,
}: LossParams): number {
	const split = MILITARY.applyTroopLosses({
		state,
		war,
		losses: MILITARY.casualties({ members, losses }),
	})
	if (garrison)
		for (const [nation, men] of Object.entries(split)) {
			const entry = siege.garrison[Number(nation)]
			if (entry) {
				entry.levy = Math.max(0, entry.levy - men.levy)
				entry.regular = Math.max(0, entry.regular - men.regular)
			}
		}
	return Object.values(split).reduce((sum, m) => sum + m.levy + m.regular, 0)
}

function party({ members, share }: PartyParams): CoalitionMember[] {
	return members.map((m) => ({
		...m,
		levy: m.levy * share,
		regular: m.regular * share,
		force: m.force * share,
	}))
}

const SIEGE_GARRISON_FIELD_CAP = 0.5
