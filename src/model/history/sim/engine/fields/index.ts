import type {
	DispSetParams,
	ProvGetParams,
	ProvSetParams,
	RelationKeyParams,
	RelGetParams,
	RelSetParams,
} from "@/model/history/sim/engine/fields/types"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { MILITARY } from "@/model/history/sim/engine/military"
import type {
	Disposition,
	Relation,
} from "@/model/history/sim/engine/state/types"

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
				MILITARY.beforeProvinceMutation({ state, p })
				if (value >= 0) MILITARY.beforeProvinceMutation({ state, p: value })
				JOURNAL.parent({
					state,
					province: p,
					before: state.parentCurrent[p],
					after: value,
				})
				state.parentCurrent[p] = value
				state.hierarchyDirty = true
				MILITARY.afterMutation({ state })
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
				MILITARY.beforeProvinceMutation({ state, p })
				state.popRuralCurrent[p] = value
				MILITARY.afterMutation({ state })
			},
		},
		urban: {
			get: ({ state, p }: ProvGetParams) => state.popUrbanCurrent[p],
			set: ({ state, p, value }: ProvSetParams) => {
				MILITARY.beforeProvinceMutation({ state, p })
				state.popUrbanCurrent[p] = value
				MILITARY.afterMutation({ state })
			},
		},
	},
	development: {
		get: ({ state, p }: ProvGetParams) => state.developmentCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			MILITARY.beforeProvinceMutation({ state, p })
			state.developmentCurrent[p] = value
			MILITARY.afterMutation({ state })
		},
	},
	knowledge: {
		get: ({ state, p }: ProvGetParams) => state.knowledgeCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			MILITARY.beforeProvinceMutation({ state, p })
			state.knowledgeCurrent[p] = value
			MILITARY.afterMutation({ state })
		},
	},
	treasury: {
		get: ({ state, p }: ProvGetParams) => state.treasuryCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			MILITARY.beforeMutation({ state, nation: p })
			state.treasuryCurrent[p] = value
			MILITARY.afterMutation({ state })
		},
	},
	government: {
		get: ({ state, p }: ProvGetParams) => state.governmentType[p],
		set: ({ state, p, value }: ProvSetParams) => {
			MILITARY.beforeMutation({ state, nation: p })
			state.governmentType[p] = value
			state.realmCache.clear()
			MILITARY.afterMutation({ state })
		},
	},
	revenue: {
		get: ({ state, p }: ProvGetParams) => state.revenueCurrent[p],
		set: ({ state, p, value }: ProvSetParams) => {
			state.revenueCurrent[p] = value
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

export const RELATION_CODE: Record<Relation, number> = {
	NONE: 0,
	OVERLORD: 1,
	VASSAL: 2,
	PU_SENIOR: 3,
	PU_JUNIOR: 4,
	ALLY: 5,
	WAR: 10,
	COLONY: 11,
}
export const DISPOSITION_CODE: Record<Disposition, number> = {
	RIVAL: 0,
	SUSPICIOUS: 1,
	NEUTRAL: 2,
	FRIENDLY: 3,
	TRUSTED: 4,
}
const RELATION_NAME: Record<number, Relation> = Object.fromEntries(
	Object.entries(RELATION_CODE).map(([name, code]) => [code, name]),
) as Record<number, Relation>
const DISPOSITION_NAME: Record<number, Disposition> = Object.fromEntries(
	Object.entries(DISPOSITION_CODE).map(([name, code]) => [code, name]),
) as Record<number, Disposition>

export function decodeRelation(code: number): Relation {
	return RELATION_NAME[code] ?? "NONE"
}

export function decodeDisposition(code: number): Disposition {
	return DISPOSITION_NAME[code] ?? "NEUTRAL"
}

function relationKey({ state, a, b }: RelationKeyParams): number {
	return a * state.P + b
}

function flipRelation(rel: Relation): Relation {
	switch (rel) {
		case "OVERLORD":
			return "VASSAL"
		case "VASSAL":
			return "OVERLORD"
		case "PU_SENIOR":
			return "PU_JUNIOR"
		case "PU_JUNIOR":
			return "PU_SENIOR"
		case "COLONY":
			return "OVERLORD"
		default:
			return rel
	}
}

const rel = {
	get: ({ state, a, b }: RelGetParams): Relation =>
		decodeRelation(state.relationsCurrent[a * state.P + b]),
	set: ({ state, a, b, rel }: RelSetParams): void => {
		MILITARY.mutate({
			state,
			action: () => {
				const forwardKey = relationKey({ state, a, b })
				const backwardKey = relationKey({ state, a: b, b: a })
				const flipped = flipRelation(rel)
				if (state.relationsCurrent[forwardKey] !== RELATION_CODE[flipped])
					JOURNAL.relation({
						state,
						x: a,
						y: b,
						before: state.relationsCurrent[forwardKey],
						after: RELATION_CODE[flipped],
					})
				if (state.relationsCurrent[backwardKey] !== RELATION_CODE[rel])
					JOURNAL.relation({
						state,
						x: b,
						y: a,
						before: state.relationsCurrent[backwardKey],
						after: RELATION_CODE[rel],
					})
				state.militaryDiplomacyDirty = true
				state.militaryDiplomacyNations.add(a).add(b)
				state.relationsCurrent[forwardKey] = RELATION_CODE[flipped]
				state.relationsCurrent[backwardKey] = RELATION_CODE[rel]
				const held =
					rel !== "NONE" ||
					state.dispositionsCurrent[forwardKey] !== DISPOSITION_CODE.NEUTRAL
				if (held) {
					state.relationColumns[a].add(b)
					state.relationColumns[b].add(a)
				} else {
					state.relationColumns[a].delete(b)
					state.relationColumns[b].delete(a)
				}
			},
		})
	},
} as const

const disp = {
	get: ({ state, a, b }: RelGetParams): Disposition =>
		decodeDisposition(state.dispositionsCurrent[relationKey({ state, a, b })]),
	set: ({ state, a, b, disposition, cause }: DispSetParams): void => {
		MILITARY.mutate({
			state,
			action: () => {
				const forward = relationKey({ state, a, b })
				const backward = relationKey({ state, a: b, b: a })
				const before = decodeDisposition(state.dispositionsCurrent[forward])
				if (before === disposition) return
				state.militaryDiplomacyDirty = true
				state.militaryDiplomacyNations.add(a).add(b)
				const code = DISPOSITION_CODE[disposition]
				state.dispositionsCurrent[forward] = code
				state.dispositionsCurrent[backward] = code
				const held =
					code !== DISPOSITION_CODE.NEUTRAL ||
					state.relationsCurrent[forward] !== RELATION_CODE.NONE
				if (held) {
					state.relationColumns[a].add(b)
					state.relationColumns[b].add(a)
				} else {
					state.relationColumns[a].delete(b)
					state.relationColumns[b].delete(a)
				}
				state.events.push({
					tag: "disposition changed",
					time: state.time,
					data: { a, b, before, after: disposition, cause },
				})
			},
		})
	},
} as const

export const FIELDS = {
	prov,
	rel,
	disp,
}
