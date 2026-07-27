import type {
	DeltaFieldParams,
	RelationKeyParams,
} from "@/model/history/fields/types"
import type { Relation } from "@/model/history/state"
import type { HistoryState } from "@/model/history/state/types"
import { TIMELINE, type Timeline } from "@/model/history/timeline"

function getField<T>(
	timeline: Timeline<T>,
	defaultValue: T,
	time: number | undefined,
): T {
	return TIMELINE.read(timeline, defaultValue, time)
}

function setField<T>(timeline: Timeline<T>, time: number, value: T): void {
	TIMELINE.write(timeline, time, value)
}

function deltaField({
	timeline,
	defaultValue,
	time,
	delta,
}: DeltaFieldParams): number {
	const next = TIMELINE.read(timeline, defaultValue, time) + delta
	TIMELINE.write(timeline, time, next)
	return next
}

const prov = {
	parent: {
		get: (state: HistoryState, p: number, time = state.time) => {
			if (time === state.time) return state.parentCurrent[p]
			return getField(state._parent[p], -1, time)
		},
		set: (state: HistoryState, p: number, time: number, value: number) => {
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
							: getField(state._parent[current], -1, time)
					steps++
					if (steps > state.P) {
						throw new Error(
							`Parent cycle detected while validating assignment of ${p} to ${value} at time ${time}`,
						)
					}
				}
			}
			setField(state._parent[p], time, value)
			if (time >= state.time) {
				if (state.parentCurrent[p] !== value) {
					state.parentCurrent[p] = value
					state.hierarchyDirty = true
				}
			}
		},
	},
	assignment: {
		get: (state: HistoryState, p: number, time = state.time) =>
			time === state.time
				? state.assignmentCurrent[p]
				: getField(state._assignment[p], -1, time),
		set: (state: HistoryState, p: number, time: number, value: number) => {
			setField(state._assignment[p], time, value)
			if (time >= state.time) state.assignmentCurrent[p] = value
		},
	},
	population: {
		rural: {
			get: (state: HistoryState, p: number, time = state.time) =>
				time === state.time
					? state.popRuralCurrent[p]
					: getField(state._pop_rural[p], 0, time),
			set: (state: HistoryState, p: number, time: number, value: number) => {
				setField(state._pop_rural[p], time, value)
				if (time >= state.time) state.popRuralCurrent[p] = value
			},
		},
		urban: {
			get: (state: HistoryState, p: number, time = state.time) =>
				time === state.time
					? state.popUrbanCurrent[p]
					: getField(state._pop_urban[p], 0, time),
			set: (state: HistoryState, p: number, time: number, value: number) => {
				setField(state._pop_urban[p], time, value)
				if (time >= state.time) state.popUrbanCurrent[p] = value
			},
		},
	},
	development: {
		get: (state: HistoryState, p: number, time = state.time) =>
			time === state.time
				? state.developmentCurrent[p]
				: getField(state._development[p], 0, time),
		set: (state: HistoryState, p: number, time: number, value: number) => {
			setField(state._development[p], time, value)
			if (time >= state.time) state.developmentCurrent[p] = value
		},
	},
	consumption: {
		get: (state: HistoryState, p: number, time = state.time) =>
			time === state.time
				? state.consumptionCurrent[p]
				: getField(state._consumption[p], 0, time),
		set: (state: HistoryState, p: number, time: number, value: number) => {
			setField(state._consumption[p], time, value)
			if (time >= state.time) state.consumptionCurrent[p] = value
		},
		delta: (state: HistoryState, p: number, time: number, delta: number) => {
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
			get: (state: HistoryState, p: number, time = state.time) =>
				time === state.time
					? state.leaderDynCurrent[p]
					: getField(state._leader_dyn[p], -1, time),
			set: (state: HistoryState, p: number, time: number, value: number) => {
				setField(state._leader_dyn[p], time, value)
				if (time >= state.time) state.leaderDynCurrent[p] = value
			},
		},
		nameSeed: {
			get: (state: HistoryState, p: number, time = state.time) =>
				time === state.time
					? state.leaderNameSeedCurrent[p]
					: getField(state._leader_name_seed[p], -1, time),
			set: (state: HistoryState, p: number, time: number, value: number) => {
				setField(state._leader_name_seed[p], time, value)
				if (time >= state.time) {
					state.leaderNameSeedCurrent[p] = value
					state.leaderRuntime.nameSeed[p] = value
				}
			},
		},
		claim: {
			get: (state: HistoryState, p: number, time = state.time) =>
				time === state.time
					? state.leaderClaimCurrent[p]
					: getField(state._leader_claim[p], 0, time),
			set: (state: HistoryState, p: number, time: number, value: number) => {
				setField(state._leader_claim[p], time, value)
				if (time >= state.time) state.leaderClaimCurrent[p] = value
			},
		},
		birthYear: {
			get: (state: HistoryState, p: number, time = state.time) =>
				time === state.time
					? state.leaderBirthYearCurrent[p]
					: getField(state._leader_birth_year[p], -1, time),
			set: (state: HistoryState, p: number, time: number, value: number) => {
				setField(state._leader_birth_year[p], time, value)
				if (time >= state.time) state.leaderBirthYearCurrent[p] = value
			},
		},
	},
	occupation: {
		get: (state: HistoryState, p: number, time = state.time) =>
			time === state.time
				? state.occupationCurrent[p]
				: getField(state._occupation[p], -1, time),
		set: (state: HistoryState, p: number, time: number, value: number) => {
			setField(state._occupation[p], time, value)
			if (time >= state.time) state.occupationCurrent[p] = value
		},
	},
	cultureBlendSecondary: {
		get: (state: HistoryState, p: number, time = state.time) =>
			time === state.time
				? state.cultureBlendSecondaryCurrent[p]
				: getField(state._culture_blend_secondary[p], -1, time),
		set: (state: HistoryState, p: number, time: number, value: number) => {
			setField(state._culture_blend_secondary[p], time, value)
			if (time >= state.time) state.cultureBlendSecondaryCurrent[p] = value
		},
	},
	cultureBlendWeight: {
		get: (state: HistoryState, p: number, time = state.time) =>
			time === state.time
				? state.cultureBlendWeightCurrent[p]
				: getField(state._culture_blend_weight[p], 0, time),
		set: (state: HistoryState, p: number, time: number, value: number) => {
			setField(state._culture_blend_weight[p], time, value)
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
	get: (
		state: HistoryState,
		a: number,
		b: number,
		time = state.time,
	): Relation => {
		if (time === state.time) {
			return state.relationsCurrent[a * state.P + b] as Relation
		}
		const timeline = state._relations.get(relationKey({ state, a, b }))
		return timeline
			? (TIMELINE.read(timeline, 7 as Relation, time) as Relation)
			: 7
	},
	set: (
		state: HistoryState,
		a: number,
		b: number,
		rel: Relation,
		time = state.time,
	): void => {
		const forwardKey = relationKey({ state, a, b })
		const backwardKey = relationKey({ state, a: b, b: a })
		const flipped = flipRelation(rel)
		const forward = state._relations.get(forwardKey) ?? []
		const backward = state._relations.get(backwardKey) ?? []
		state._relations.set(forwardKey, forward)
		state._relations.set(backwardKey, backward)
		TIMELINE.write(forward, time, flipped)
		TIMELINE.write(backward, time, rel)
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
