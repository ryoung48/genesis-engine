import type { Relation } from "@/model/history/generated/state"
import type { HistoryState } from "@/model/history/generated/state/types"
import type { Timeline } from "@/model/history/generated/timeline/types"

export interface DeltaFieldParams {
	timeline: Timeline<number>
	defaultValue: number
	time: number
	delta: number
}

export interface GetFieldParams<T> {
	timeline: Timeline<T>
	defaultValue: T
	time: number | undefined
}

export interface RelationKeyParams {
	state: HistoryState
	a: number
	b: number
}

export interface SetFieldParams<T> {
	timeline: Timeline<T>
	time: number
	value: T
}

export interface ProvParentGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvParentSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvAssignmentGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvAssignmentSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvPopulationRuralGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvPopulationRuralSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvPopulationUrbanGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvPopulationUrbanSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvDevelopmentGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvDevelopmentSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvConsumptionGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvConsumptionSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvConsumptionDeltaParams {
	state: HistoryState
	p: number
	time: number
	delta: number
}

export interface ProvLeaderDynastyGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvLeaderDynastySetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvLeaderNameSeedGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvLeaderNameSeedSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvLeaderClaimGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvLeaderClaimSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvLeaderBirthYearGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvLeaderBirthYearSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvOccupationGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvOccupationSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvCultureBlendSecondaryGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvCultureBlendSecondarySetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface ProvCultureBlendWeightGetParams {
	state: HistoryState
	p: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface ProvCultureBlendWeightSetParams {
	state: HistoryState
	p: number
	time: number
	value: number
}

export interface RelGetParams {
	state: HistoryState
	a: number
	b: number
	/** [JUSTIFICATION] The getter defaults to the history state's current time. */
	time?: number
}

export interface RelSetParams {
	state: HistoryState
	a: number
	b: number
	rel: Relation
	/** [JUSTIFICATION] The setter defaults to the history state's current time. */
	time?: number
}
