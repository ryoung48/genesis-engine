import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import type {
	StressFlags,
	StressYearParams,
	WriteStressParams,
} from "@/model/history/sim/engine/events/people/stress/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { CHARACTER } from "@/model/history/sim/people/character"
import { HEALTH } from "@/model/history/sim/people/health"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { STRESS } from "@/model/history/sim/people/stress"

// Records a changed stress level; a rise is a mental break, which advances a
// Faltering Heart. True when that heart has failed. Nothing else changes
// here: the death is applied once the whole year's stress is written.
function write({ state, person, value, time }: WriteStressParams): boolean {
	const people = state.people
	const table = people.persons
	const before = STRESS.level(table.stress[person])
	const after = STRESS.level(value)
	table.stress[person] = value
	if (before === after || table.death[person] <= time) return false
	PEOPLE_LOG.append({
		log: people.log,
		row: { kind: "stress", person, time, level: after },
	})
	if (after < before) return false
	const rise = AGEING.heartRise({ people, person })
	if (rise.change)
		PEOPLE_LOG.append({
			log: people.log,
			row: {
				kind: "condition",
				person,
				time,
				condition: AGEING.conditions[rise.change.condition],
				before: rise.change.before,
				after: rise.change.after,
			},
		})
	return rise.terminal
}

// Steps every sovereign ruler's stress once, from a list fixed at the start.
// Returns the rulers whose heart failed, in person order.
function runYear({ state }: StressYearParams): number[] {
	const people = state.people
	const table = people.persons
	const time = state.time / STATE.yearMs
	const rulers = new Map<number, StressFlags>()
	const attackers = new Set<number>()
	const revolts = new Set<number>()
	for (const id of state.activeWarIds) {
		const war = state.wars[id]
		if (war.endTime === undefined) {
			attackers.add(war.attacker)
			if (war.goal === "independence" || war.goal === "throne")
				revolts.add(STATE.warSides({ war }).crown)
		}
	}
	for (let realm = 0; realm < state.P; realm++) {
		const person = people.rulerOf[realm]
		if (person < 0 || !STATE.isSovereign({ state, p: realm })) continue
		const flags = rulers.get(person) ?? {
			war: false,
			attacking: false,
			revolt: false,
			debt: false,
			paying: false,
		}
		flags.war ||= MILITARY.atWar({ state, nation: realm })
		flags.attacking ||= attackers.has(realm)
		flags.revolt ||= revolts.has(realm)
		flags.debt ||= FIELDS.prov.treasury.get({ state, p: realm }) < 0
		const overlord = STATE.diplomaticOverlord({ state, nation: realm })
		flags.paying ||=
			(overlord >= 0 && VASSALAGE.pays({ state, vassal: realm, overlord })) ||
			state.indemnities.some(
				(entry) =>
					entry.payer === realm &&
					entry.until > state.time &&
					STATE.isSovereign({ state, p: entry.receiver }),
			)
		rulers.set(person, flags)
	}
	for (const person of people.stressed)
		if (!rulers.has(person)) write({ state, person, value: 0, time })
	people.stressed = []
	const failed: number[] = []
	for (const [person, flags] of rulers) {
		const bereavements = people.bereavements.get(person) ?? 0
		const value = STRESS.step({
			conditions: HEALTH.stressConditions({ people, person }),
			character: CHARACTER.of({ people, person }),
			age: time - table.birth[person],
			value: table.stress[person],
			bereavements,
			...flags,
		})
		if (write({ state, person, value, time })) failed.push(person)
		if (value > 0) people.stressed.push(person)
	}
	people.bereavements.clear()
	return failed.sort((a, b) => a - b)
}
export const STRESS_EVENTS = { runYear }
