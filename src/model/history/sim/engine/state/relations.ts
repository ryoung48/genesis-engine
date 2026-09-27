import { DERIVE } from "@/model/history/sim/engine/derive"
import { FIELDS } from "@/model/history/sim/engine/fields"
import {
	type Relation,
	rel as relationKind,
} from "@/model/history/sim/engine/state/index"
import type {
	CanAllyParams,
	GetRelationParams,
	GetRulerRelationParams,
	GetSovereignParams,
	IsSovereignParams,
	SetRelationParams,
} from "@/model/history/sim/engine/state/types"

export function getRelation({ state, a, b }: GetRelationParams): Relation {
	return FIELDS.rel.get({ state, a, b })
}

export function setRelation({ state, a, b, rel }: SetRelationParams): void {
	const old = getRelation({ state, a: b, b: a })
	if (old === rel) return
	FIELDS.rel.set({ state, a, b, rel })
	if (isSubjectLink(old) || isSubjectLink(rel)) {
		pruneAlliances({ state, nation: a })
		pruneAlliances({ state, nation: b })
	}
	if (old === relationKind.ALLY && rel !== relationKind.ALLY) {
		for (const ruler of [a, b])
			for (const subject of [...state.relationColumns[ruler]].sort(
				(x, y) => x - y,
			))
				if (isSubject(getRelation({ state, a: ruler, b: subject })))
					pruneAlliances({ state, nation: subject })
	}
}

function isSubjectLink(relation: Relation): boolean {
	return (
		relation === relationKind.OVERLORD ||
		relation === relationKind.VASSAL ||
		relation === relationKind.PU_SENIOR ||
		relation === relationKind.PU_JUNIOR ||
		relation === relationKind.COLONY
	)
}

function isSubject(relation: Relation): boolean {
	return (
		relation === relationKind.VASSAL ||
		relation === relationKind.PU_JUNIOR ||
		relation === relationKind.COLONY
	)
}

export function diplomaticOverlord({
	state,
	nation,
}: GetRulerRelationParams): number {
	const ruler = getRulerRelation({ state, nation })
	return ruler?.relation === relationKind.OVERLORD &&
		getRelation({ state, a: ruler.ruler, b: nation }) === relationKind.VASSAL
		? ruler.ruler
		: -1
}

export function canAlly({ state, a, b }: CanAllyParams): boolean {
	const rulerA = getRulerRelation({ state, nation: a })?.ruler
	const rulerB = getRulerRelation({ state, nation: b })?.ruler
	return (
		(rulerA === undefined ||
			getRelation({ state, a: rulerA, b }) === relationKind.ALLY ||
			rulerA === rulerB) &&
		(rulerB === undefined ||
			getRelation({ state, a: rulerB, b: a }) === relationKind.ALLY ||
			rulerB === rulerA)
	)
}

function pruneAlliances({ state, nation }: GetRulerRelationParams): void {
	for (const other of [...state.relationColumns[nation]].sort((a, b) => a - b))
		if (
			getRelation({ state, a: nation, b: other }) === relationKind.ALLY &&
			!canAlly({ state, a: nation, b: other })
		)
			setRelation({ state, a: nation, b: other, rel: relationKind.FRIENDLY })
}

export function getRulerRelation({
	state,
	nation,
}: GetRulerRelationParams): { ruler: number; relation: Relation } | undefined {
	const P = state.P
	const rels = state.relationsCurrent
	const base = nation * P
	let ruler = -1
	let rulerRelation: Relation = relationKind.NONE
	for (const other of state.relationColumns[nation]) {
		if (other === nation || state.desolate[other]) continue
		if (ruler >= 0 && other > ruler) continue
		const relation = rels[base + other] as Relation
		if (
			relation === relationKind.OVERLORD ||
			relation === relationKind.PU_SENIOR
		) {
			ruler = other
			rulerRelation = relation
		}
	}
	return ruler >= 0 ? { ruler, relation: rulerRelation } : undefined
}

export function getSovereign({ state, p }: GetSovereignParams): number {
	return DERIVE.sovereign({ state, p })
}

export function isSovereign({ state, p }: IsSovereignParams): boolean {
	DERIVE.ensureHierarchyClean(state)
	return state.parentCurrent[p] < 0 && state.sovereignCurrent[p] >= 0
}
