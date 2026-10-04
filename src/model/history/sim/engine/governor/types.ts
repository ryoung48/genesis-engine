import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { Attribute } from "@/model/history/sim/people/attributes/types"
import type { PersonalityTrait } from "@/model/history/sim/people/traits/types"
export interface GovernorParams {
	state: HistoryState
	realm: number
}
export interface GovernorAttributeParams extends GovernorParams {
	attribute: Attribute
}
export interface GovernorTraitParams extends GovernorParams {
	trait: PersonalityTrait
}
export interface PersonAttributeParams {
	state: HistoryState
	person: number
	attribute: Attribute
}
export interface AttributeFactorParams {
	attribute: Attribute
	value: number
}

export interface PersonTraitParams {
	state: HistoryState
	person: number
	trait: PersonalityTrait
}

export interface WarStartParams extends GovernorParams {
	threat: number
	roll: number
}
