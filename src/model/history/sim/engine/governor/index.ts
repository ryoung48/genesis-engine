import type {
	AttributeFactorParams,
	GovernorAttributeParams,
	GovernorParams,
	GovernorTraitParams,
	PersonAttributeParams,
	PersonTraitParams,
	WarStartParams,
} from "@/model/history/sim/engine/governor/types"
import { STATE } from "@/model/history/sim/engine/state"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { CHARACTER } from "@/model/history/sim/people/character"
import { HEALTH } from "@/model/history/sim/people/health"
import { TRAITS } from "@/model/history/sim/people/traits"
import type { Regency } from "@/model/history/sim/people/types"

function regency({ state, realm }: GovernorParams): Regency | null {
	const entry = state.people.regencies.get(realm)
	return entry && entry.ward === state.people.rulerOf[realm] ? entry : null
}
function of(params: GovernorParams): number {
	return regency(params)?.regent ?? params.state.people.rulerOf[params.realm]
}
function personAttribute({
	state,
	person,
	attribute,
}: PersonAttributeParams): number {
	return ATTRIBUTES.effective({
		conditions: HEALTH.attributeConditions({ people: state.people, person }),
		character: CHARACTER.of({ people: state.people, person }),
		age: state.time / STATE.yearMs - state.people.persons.birth[person],
		attribute,
	})
}
function attribute(params: GovernorAttributeParams): number {
	const person = of(params)
	return person >= 0
		? personAttribute({
				state: params.state,
				person,
				attribute: params.attribute,
			})
		: regency(params)
			? 5
			: ATTRIBUTES.neutral(params.attribute)
}
function personHas({ state, person, trait }: PersonTraitParams): boolean {
	return (
		person >= 0 &&
		TRAITS.has({
			trait,
			character: CHARACTER.of({ people: state.people, person }),
			age: state.time / STATE.yearMs - state.people.persons.birth[person],
		})
	)
}
function has(params: GovernorTraitParams): boolean {
	return personHas({
		state: params.state,
		person: of(params),
		trait: params.trait,
	})
}
function warChance({ state, realm }: GovernorParams): number {
	const person = state.people.rulerOf[realm]
	return person < 0
		? 1 / 1.11
		: TRAITS.warChance({
				character: CHARACTER.of({ people: state.people, person }),
				age: state.time / STATE.yearMs - state.people.persons.birth[person],
			})
}
function incomeFactor(params: GovernorParams): number {
	const person = of(params)
	return person < 0
		? 1
		: TRAITS.incomeFactor({
				character: CHARACTER.of({ people: params.state.people, person }),
				age:
					params.state.time / STATE.yearMs -
					params.state.people.persons.birth[person],
			})
}

function factor({ attribute, value }: AttributeFactorParams): number {
	const delta = value - ATTRIBUTES.neutral(attribute)
	if (attribute === "diplomacy" && delta === 0) return 0
	if (attribute === "diplomacy")
		return Math.max(-0.1, Math.min(0.1, -0.0125 * delta))
	if (attribute === "intrigue")
		return Math.max(0.5, Math.min(2, 1 + 0.125 * delta))
	if (attribute === "learning")
		return Math.max(0.93, Math.min(1.1, 1 + 0.0125 * delta))
	return Math.max(0.87, Math.min(1.21, 1 + 0.025 * delta))
}
function candidateStrength(value: number): number {
	return 0.025 * (value - ATTRIBUTES.neutral("diplomacy"))
}
function startsWar(params: WarStartParams): boolean {
	return params.roll < Math.min(1, (1 - params.threat) * warChance(params))
}
export const GOVERNOR = {
	candidateStrength,
	startsWar,
	personHas,
	warChance,
	incomeFactor,
	of,
	regency,
	attribute,
	has,
	personAttribute,
	factor,
}
