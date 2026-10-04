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
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { STRESS } from "@/model/history/sim/people/stress"

function write({ state, person, value, time }: WriteStressParams): void {
	const table = state.people.persons
	const before = STRESS.level(table.stress[person])
	table.stress[person] = value
	if (before !== STRESS.level(value) && table.death[person] > time)
		PEOPLE_LOG.append({
			log: state.people.log,
			row: { kind: "stress", person, time, level: STRESS.level(value) },
		})
}
function runYear({ state }: StressYearParams): void {
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
	for (const [person, flags] of rulers) {
		const relatives = new Set([table.spouse[person], ...table.children[person]])
		let bereavements = 0
		for (const relative of relatives)
			if (
				relative >= 0 &&
				table.death[relative] > time - 1 &&
				table.death[relative] <= time
			)
				bereavements++
		const value = STRESS.step({
			conditions: [],
			character: CHARACTER.of({ people, person }),
			age: time - table.birth[person],
			value: table.stress[person],
			bereavements,
			...flags,
		})
		write({ state, person, value, time })
		if (value > 0) people.stressed.push(person)
	}
}
export const STRESS_EVENTS = { runYear }
