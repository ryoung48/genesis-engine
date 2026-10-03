import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface KnowledgeRealm {
	nation: number
	population: number
	knowledge: number
	government: string
	surplus: number
}

export interface KnowledgeSnapshot {
	year: number
	population: number
	weightedKnowledge: number
	quantiles: number[]
	top: KnowledgeRealm[]
	cohorts: Record<
		string,
		{ population: number; realms: number; weightedKnowledge: number }
	>
}

export interface SnapshotParams {
	engine: HistoryState
}
