import type { HistoryEvents, HistoryRecord } from "@/model/history/record/types"

export type AffiliationRecord = Pick<
	HistoryRecord,
	"minTimeMs" | "maxTimeMs" | "origin"
> & { events: Pick<HistoryEvents, "provinceEvents" | "nationEvents"> }

export interface AffiliationParams {
	record: AffiliationRecord
	province: number
	timeMs: number
}

export interface ResolveAffiliationParams extends AffiliationParams {
	inclusive: boolean
}

export interface TransitionParams {
	record: AffiliationRecord
}

export interface TerritoryNode {
	owner: number
	parent: number
}

export interface TerritorialChange {
	province: number
	timeMs: number
	kind: "owner" | "parent"
	value: number
}

export interface RealmTransition {
	timeMs: number
	before: number
	after: number
}

export interface TerritorialRootParams {
	province: number
	origin: AffiliationRecord["origin"]
	nodeOf: (province: number) => TerritoryNode | undefined
	identityOf: (province: number) => number
}
