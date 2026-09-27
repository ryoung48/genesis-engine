import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { SocietyEra } from "@/model/society/types"

export interface HistoryRunOptions {
	seed: number
	era: SocietyEra
	numPoints: number
	years: number
	summaryPath: string
	log: (line: string) => void
}

export interface EnvParams {
	env: Record<string, string | undefined>
	log: (line: string) => void
}

export interface YearReport {
	year: number
	tickMs: number
	frameMs: number
	nations: number
	activeWars: number
	activeRebelWars: number
	rebelStripedProvinces: number
	occupiedProvinces: number
	recordNations: number
	provinceEvents: number
	titleEvents: number
	wars: number
	diplomacyEvents: number
	population: number
}

export interface HistoryRunSummary {
	seed: number
	era: SocietyEra
	numPoints: number
	provinceCount: number
	generationMs: number
	initMs: number
	reports: YearReport[]
}

export interface CreateEngineParams {
	seed: number
	era: SocietyEra
	numPoints: number
	// [JUSTIFICATION] Omitted, the engine starts at its default year and era level.
	startYear?: number
}

export interface CreatedEngine {
	generated: ReturnType<typeof GENERATE_WORLD.generateGenesisWorld>
	engine: HistoryState
	generationMs: number
	engineMs: number
}
