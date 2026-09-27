import type {
	ProvGetParams,
	ProvSetParams,
	RelationKeyParams,
	RelGetParams,
	RelSetParams,
} from "@/model/history/sim/engine/fields/types"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import type { Relation } from "@/model/history/sim/engine/state"

function parentWouldCycle({ state, p, value }: ProvSetParams): boolean {
	let current = value
	let steps = 0
	while (current >= 0) {
		if (current === p) return true
		current = state.parentCurrent[current]
		steps++
		if (steps > state.P) return true
	}
	return false
}

const prov = {
	parent: {
		get: ({ state, p }: ProvGetParams) => state.parentCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			if (value === p) {
				throw new Error(
					`Invalid parent assignment: province ${p} cannot parent itself`,
				)
			}
			if (value >= 0 && parentWouldCycle({ state, p, value })) {
				throw new Error(
					`Invalid parent assignment would create cycle: setting parent of ${p} to ${value} at time ${state.time}`,
				)
			}
			if (state.parentCurrent[p] !== value) {
				JOURNAL.parent({
					state,
					province: p,
					before: state.parentCurrent[p],
					after: value,
				})
				state.parentCurrent[p] = value
				state.hierarchyDirty = true
			}
		},
	},
	assignment: {
		get: ({ state, p }: ProvGetParams) => state.assignmentCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.assignmentCurrent[p] = value
		},
	},
	population: {
		rural: {
			get: ({ state, p }: ProvGetParams) => state.popRuralCurrent[p],
			set: ({ state, p, value }: ProvSetParams) => {
				state.popRuralCurrent[p] = value
			},
		},
		urban: {
			get: ({ state, p }: ProvGetParams) => state.popUrbanCurrent[p],
			set: ({ state, p, value }: ProvSetParams) => {
				state.popUrbanCurrent[p] = value
			},
		},
	},
	development: {
		get: ({ state, p }: ProvGetParams) => state.developmentCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.developmentCurrent[p] = value
		},
	},
	knowledge: {
		get: ({ state, p }: ProvGetParams) => state.knowledgeCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.knowledgeCurrent[p] = value
		},
	},
	treasury: {
		get: ({ state, p }: ProvGetParams) => state.treasuryCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.treasuryCurrent[p] = value
		},
	},
	manpower: {
		get: ({ state, p }: ProvGetParams) => state.manpowerCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.manpowerCurrent[p] = value
		},
	},
	revenue: {
		get: ({ state, p }: ProvGetParams) => state.revenueCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.revenueCurrent[p] = value
		},
	},
	maxManpower: {
		get: ({ state, p }: ProvGetParams) => state.maxManpowerCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.maxManpowerCurrent[p] = value
		},
	},
	plunderedUntil: {
		get: ({ state, p }: ProvGetParams) => state.plunderedUntil[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.plunderedUntil[p] = value
		},
	},
	leader: {
		dynasty: {
			get: ({ state, p }: ProvGetParams) => state.leaderDynCurrent[p],
			set: ({ state, p, value }: ProvSetParams) => {
				state.leaderDynCurrent[p] = value
			},
		},
		nameSeed: {
			get: ({ state, p }: ProvGetParams) => state.leaderNameSeedCurrent[p],
			set: ({ state, p, value }: ProvSetParams) => {
				state.leaderNameSeedCurrent[p] = value
				state.leaderRuntime.nameSeed[p] = value
			},
		},
		claim: {
			get: ({ state, p }: ProvGetParams) => state.leaderClaimCurrent[p],
			set: ({ state, p, value }: ProvSetParams) => {
				state.leaderClaimCurrent[p] = value
			},
		},
		birthYear: {
			get: ({ state, p }: ProvGetParams) => state.leaderBirthYearCurrent[p],
			set: ({ state, p, value }: ProvSetParams) => {
				state.leaderBirthYearCurrent[p] = value
			},
		},
	},
	occupation: {
		get: ({ state, p }: ProvGetParams) => state.occupationCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			if (state.occupationCurrent[p] !== value)
				JOURNAL.occupation({
					state,
					province: p,
					before: state.occupationCurrent[p],
					after: value,
				})
			state.occupationCurrent[p] = value
		},
	},
	cultureBlendSecondary: {
		get: ({ state, p }: ProvGetParams) => state.cultureBlendSecondaryCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.cultureBlendSecondaryCurrent[p] = value
		},
	},
	cultureBlendWeight: {
		get: ({ state, p }: ProvGetParams) => state.cultureBlendWeightCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.cultureBlendWeightCurrent[p] = value
		},
	},
} as const

const NEUTRAL_RELATION = 7

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
	get: ({ state, a, b }: RelGetParams): Relation =>
		state.relationsCurrent[a * state.P + b] as Relation,
	set: ({ state, a, b, rel }: RelSetParams): void => {
		const forwardKey = relationKey({ state, a, b })
		const backwardKey = relationKey({ state, a: b, b: a })
		const flipped = flipRelation(rel)
		if (state.relationsCurrent[forwardKey] !== flipped)
			JOURNAL.relation({
				state,
				x: a,
				y: b,
				before: state.relationsCurrent[forwardKey],
				after: flipped,
			})
		if (state.relationsCurrent[backwardKey] !== rel)
			JOURNAL.relation({
				state,
				x: b,
				y: a,
				before: state.relationsCurrent[backwardKey],
				after: rel,
			})
		state.relationsCurrent[forwardKey] = flipped
		state.relationsCurrent[backwardKey] = rel
		if (flipped === NEUTRAL_RELATION) state.relationColumns[a].delete(b)
		else state.relationColumns[a].add(b)
		if (rel === NEUTRAL_RELATION) state.relationColumns[b].delete(a)
		else state.relationColumns[b].add(a)
	},
} as const

export const FIELDS = {
	prov,
	rel,
}
