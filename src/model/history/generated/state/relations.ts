import { DERIVE } from "@/model/history/generated/derive"
import { FIELDS } from "@/model/history/generated/fields"
import { Relation, rel } from "@/model/history/generated/state/index"
import type {
	GetRelationParams,
	GetRulerRelationParams,
	GetSovereignParams,
	IsSovereignParams,
	SetRelationParams,
} from "@/model/history/generated/state/types"

export function getRelation({ state, a, b }: GetRelationParams): Relation {
	return FIELDS.rel.get({ state, a, b, time: state.time })
}

export function setRelation({ state, a, b, rel }: SetRelationParams): void {
	FIELDS.rel.set({ state, a, b, rel, time: state.time })
}

export function getRulerRelation({
	state,
	nation,
}: GetRulerRelationParams): { ruler: number; relation: Relation } | undefined {
	const P = state.P
	const rels = state.relationsCurrent
	const base = nation * P
	let ruler = -1
	let rulerRelation: Relation = rel.NONE
	for (const other of state.relationColumns[nation]) {
		if (other === nation || state.desolate[other]) continue
		if (ruler >= 0 && other > ruler) continue
		const relation = rels[base + other] as Relation
		if (relation === rel.OVERLORD || relation === rel.PU_SENIOR) {
			ruler = other
			rulerRelation = relation
		}
	}
	return ruler >= 0 ? { ruler, relation: rulerRelation } : undefined
}

export function getSovereign({ state, p }: GetSovereignParams): number {
	return DERIVE.sovereign({ state, p, t: state.time })
}

export function isSovereign({ state, p }: IsSovereignParams): boolean {
	DERIVE.ensureHierarchyClean(state)
	return state.parentCurrent[p] < 0 && state.sovereignCurrent[p] >= 0
}
