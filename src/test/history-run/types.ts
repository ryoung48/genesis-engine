import type { HistoryPipeline } from "@/model/history/record/procedural/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { GenesisWorld } from "@/model/pipelines/types"
import type { SocietyEra } from "@/model/society/types"
import type { CachedWorldParams } from "@/test/history-run/world-cache/types"

export interface HistoryRunOptions {
	pipeline: HistoryPipeline
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

export interface BuildEngineParams extends CreateEngineParams {
	generate: (params: CachedWorldParams) => GenesisWorld
}

export interface CreatedEngine {
	generated: GenesisWorld
	engine: HistoryState
	generationMs: number
	engineMs: number
}

export interface SiegeCalibrationScenario {
	terrain: number
	multiple: number
	ratio: number
	field: number
	median: number
	p99: number
	max: number
	failures: number
	storms: number
	outcomes: Record<string, number>
}

export interface DistributionRunSummary {
	pipeline: "distribution"
	seed: number
	years: number
	reportPath: string
}
