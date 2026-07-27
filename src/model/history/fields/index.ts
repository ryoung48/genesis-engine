import type {
	DeltaFieldParams,
	GetFieldParams,
	ProvAssignmentGetParams,
	ProvAssignmentSetParams,
	ProvConsumptionDeltaParams,
	ProvConsumptionGetParams,
	ProvConsumptionSetParams,
	ProvCultureBlendSecondaryGetParams,
	ProvCultureBlendSecondarySetParams,
	ProvCultureBlendWeightGetParams,
	ProvCultureBlendWeightSetParams,
	ProvDevelopmentGetParams,
	ProvDevelopmentSetParams,
	ProvLeaderBirthYearGetParams,
	ProvLeaderBirthYearSetParams,
	ProvLeaderClaimGetParams,
	ProvLeaderClaimSetParams,
	ProvLeaderDynastyGetParams,
	ProvLeaderDynastySetParams,
	ProvLeaderNameSeedGetParams,
	ProvLeaderNameSeedSetParams,
	ProvOccupationGetParams,
	ProvOccupationSetParams,
	ProvParentGetParams,
	ProvParentSetParams,
	ProvPopulationRuralGetParams,
	ProvPopulationRuralSetParams,
	ProvPopulationUrbanGetParams,
	ProvPopulationUrbanSetParams,
	RelationKeyParams,
	RelGetParams,
	RelSetParams,
	SetFieldParams,
} from "@/model/history/fields/types"
import type { Relation } from "@/model/history/state"
import { TIMELINE } from "@/model/history/timeline"

function getField<T>({ timeline, defaultValue, time }: GetFieldParams<T>): T {
	return TIMELINE.read({
		timeline,
		defaultValue,
		time: time ?? Number.POSITIVE_INFINITY,
	})
}

function setField<T>({ timeline, time, value }: SetFieldParams<T>): void {
	TIMELINE.write({ timeline, time, value })
}

function deltaField({
	timeline,
	defaultValue,
	time,
	delta,
}: DeltaFieldParams): number {
	const next = TIMELINE.read({ timeline, defaultValue, time }) + delta
	TIMELINE.write({ timeline, time, value: next })
	return next
}

const prov = {
	parent: {
		get: ({ state, p, time = state.time }: ProvParentGetParams) => {
			if (time === state.time) return state.parentCurrent[p]
			return getField({ timeline: state._parent[p], defaultValue: -1, time })
		},
		set: ({ state, p, time, value }: ProvParentSetParams) => {
			if (value === p) {
				throw new Error(
					`Invalid parent assignment: province ${p} cannot parent itself`,
				)
			}
			if (value >= 0) {
				let current = value
				let steps = 0
				while (current >= 0) {
					if (current === p) {
						throw new Error(
							`Invalid parent assignment would create cycle: setting parent of ${p} to ${value} at time ${time}`,
						)
					}
					current =
						time === state.time
							? state.parentCurrent[current]
							: getField({
									timeline: state._parent[current],
									defaultValue: -1,
									time,
								})
					steps++
					if (steps > state.P) {
						throw new Error(
							`Parent cycle detected while validating assignment of ${p} to ${value} at time ${time}`,
						)
					}
				}
			}
			setField({ timeline: state._parent[p], time, value })
			if (time >= state.time) {
				if (state.parentCurrent[p] !== value) {
					state.parentCurrent[p] = value
					state.hierarchyDirty = true
				}
			}
		},
	},
	assignment: {
		get: ({ state, p, time = state.time }: ProvAssignmentGetParams) =>
			time === state.time
				? state.assignmentCurrent[p]
				: getField({ timeline: state._assignment[p], defaultValue: -1, time }),
		set: ({ state, p, time, value }: ProvAssignmentSetParams) => {
			setField({ timeline: state._assignment[p], time, value })
			if (time >= state.time) state.assignmentCurrent[p] = value
		},
	},
	population: {
		rural: {
			get: ({ state, p, time = state.time }: ProvPopulationRuralGetParams) =>
				time === state.time
					? state.popRuralCurrent[p]
					: getField({ timeline: state._pop_rural[p], defaultValue: 0, time }),
			set: ({ state, p, time, value }: ProvPopulationRuralSetParams) => {
				setField({ timeline: state._pop_rural[p], time, value })
				if (time >= state.time) state.popRuralCurrent[p] = value
			},
		},
		urban: {
			get: ({ state, p, time = state.time }: ProvPopulationUrbanGetParams) =>
				time === state.time
					? state.popUrbanCurrent[p]
					: getField({ timeline: state._pop_urban[p], defaultValue: 0, time }),
			set: ({ state, p, time, value }: ProvPopulationUrbanSetParams) => {
				setField({ timeline: state._pop_urban[p], time, value })
				if (time >= state.time) state.popUrbanCurrent[p] = value
			},
		},
	},
	development: {
		get: ({ state, p, time = state.time }: ProvDevelopmentGetParams) =>
			time === state.time
				? state.developmentCurrent[p]
				: getField({ timeline: state._development[p], defaultValue: 0, time }),
		set: ({ state, p, time, value }: ProvDevelopmentSetParams) => {
			setField({ timeline: state._development[p], time, value })
			if (time >= state.time) state.developmentCurrent[p] = value
		},
	},
	consumption: {
		get: ({ state, p, time = state.time }: ProvConsumptionGetParams) =>
			time === state.time
				? state.consumptionCurrent[p]
				: getField({ timeline: state._consumption[p], defaultValue: 0, time }),
		set: ({ state, p, time, value }: ProvConsumptionSetParams) => {
			setField({ timeline: state._consumption[p], time, value })
			if (time >= state.time) state.consumptionCurrent[p] = value
		},
		delta: ({ state, p, time, delta }: ProvConsumptionDeltaParams) => {
			const next = deltaField({
				timeline: state._consumption[p],
				defaultValue: 0,
				time,
				delta,
			})
			if (time >= state.time) state.consumptionCurrent[p] = next
			return next
		},
	},
	leader: {
		dynasty: {
			get: ({ state, p, time = state.time }: ProvLeaderDynastyGetParams) =>
				time === state.time
					? state.leaderDynCurrent[p]
					: getField({
							timeline: state._leader_dyn[p],
							defaultValue: -1,
							time,
						}),
			set: ({ state, p, time, value }: ProvLeaderDynastySetParams) => {
				setField({ timeline: state._leader_dyn[p], time, value })
				if (time >= state.time) state.leaderDynCurrent[p] = value
			},
		},
		nameSeed: {
			get: ({ state, p, time = state.time }: ProvLeaderNameSeedGetParams) =>
				time === state.time
					? state.leaderNameSeedCurrent[p]
					: getField({
							timeline: state._leader_name_seed[p],
							defaultValue: -1,
							time,
						}),
			set: ({ state, p, time, value }: ProvLeaderNameSeedSetParams) => {
				setField({ timeline: state._leader_name_seed[p], time, value })
				if (time >= state.time) {
					state.leaderNameSeedCurrent[p] = value
					state.leaderRuntime.nameSeed[p] = value
				}
			},
		},
		claim: {
			get: ({ state, p, time = state.time }: ProvLeaderClaimGetParams) =>
				time === state.time
					? state.leaderClaimCurrent[p]
					: getField({
							timeline: state._leader_claim[p],
							defaultValue: 0,
							time,
						}),
			set: ({ state, p, time, value }: ProvLeaderClaimSetParams) => {
				setField({ timeline: state._leader_claim[p], time, value })
				if (time >= state.time) state.leaderClaimCurrent[p] = value
			},
		},
		birthYear: {
			get: ({ state, p, time = state.time }: ProvLeaderBirthYearGetParams) =>
				time === state.time
					? state.leaderBirthYearCurrent[p]
					: getField({
							timeline: state._leader_birth_year[p],
							defaultValue: -1,
							time,
						}),
			set: ({ state, p, time, value }: ProvLeaderBirthYearSetParams) => {
				setField({ timeline: state._leader_birth_year[p], time, value })
				if (time >= state.time) state.leaderBirthYearCurrent[p] = value
			},
		},
	},
	occupation: {
		get: ({ state, p, time = state.time }: ProvOccupationGetParams) =>
			time === state.time
				? state.occupationCurrent[p]
				: getField({ timeline: state._occupation[p], defaultValue: -1, time }),
		set: ({ state, p, time, value }: ProvOccupationSetParams) => {
			setField({ timeline: state._occupation[p], time, value })
			if (time >= state.time) state.occupationCurrent[p] = value
		},
	},
	cultureBlendSecondary: {
		get: ({
			state,
			p,
			time = state.time,
		}: ProvCultureBlendSecondaryGetParams) =>
			time === state.time
				? state.cultureBlendSecondaryCurrent[p]
				: getField({
						timeline: state._culture_blend_secondary[p],
						defaultValue: -1,
						time,
					}),
		set: ({ state, p, time, value }: ProvCultureBlendSecondarySetParams) => {
			setField({ timeline: state._culture_blend_secondary[p], time, value })
			if (time >= state.time) state.cultureBlendSecondaryCurrent[p] = value
		},
	},
	cultureBlendWeight: {
		get: ({ state, p, time = state.time }: ProvCultureBlendWeightGetParams) =>
			time === state.time
				? state.cultureBlendWeightCurrent[p]
				: getField({
						timeline: state._culture_blend_weight[p],
						defaultValue: 0,
						time,
					}),
		set: ({ state, p, time, value }: ProvCultureBlendWeightSetParams) => {
			setField({ timeline: state._culture_blend_weight[p], time, value })
			if (time >= state.time) state.cultureBlendWeightCurrent[p] = value
		},
	},
} as const

function relationKey({ state, a, b }: RelationKeyParams): number {
	return a * state.P + b
}

function flipRelation(rel: Relation): Relation {
	switch (rel) {
		case 1: // OVERLORD → VASSAL
			return 2
		case 2: // VASSAL → OVERLORD
			return 1
		case 3: // PU_SENIOR → PU_JUNIOR
			return 4
		case 4: // PU_JUNIOR → PU_SENIOR
			return 3
		case 11: // COLONY → OVERLORD (colonies share the OVERLORD senior side)
			return 1
		default:
			return rel
	}
}

const rel = {
	get: ({ state, a, b, time = state.time }: RelGetParams): Relation => {
		if (time === state.time) {
			return state.relationsCurrent[a * state.P + b] as Relation
		}
		const timeline = state._relations.get(relationKey({ state, a, b }))
		return timeline
			? (TIMELINE.read({
					timeline,
					defaultValue: 7 as Relation,
					time,
				}) as Relation)
			: 7
	},
	set: ({ state, a, b, rel, time = state.time }: RelSetParams): void => {
		const forwardKey = relationKey({ state, a, b })
		const backwardKey = relationKey({ state, a: b, b: a })
		const flipped = flipRelation(rel)
		const forward = state._relations.get(forwardKey) ?? []
		const backward = state._relations.get(backwardKey) ?? []
		state._relations.set(forwardKey, forward)
		state._relations.set(backwardKey, backward)
		TIMELINE.write({ timeline: forward, time, value: flipped })
		TIMELINE.write({ timeline: backward, time, value: rel })
		if (time >= state.time) {
			state.relationsCurrent[forwardKey] = flipped
			state.relationsCurrent[backwardKey] = rel
		}
	},
} as const

export const FIELDS = {
	prov,
	rel,
}
