import type { HistoryState as RecordState } from "@/model/history/record/types"
import type { HistoryState as EngineState } from "@/model/history/sim/engine/state/types"
import type { Pregnancy } from "@/model/history/sim/people/fertility/types"
import type { Wedding } from "@/model/history/sim/people/marriage/types"
import type { ScheduledDeath } from "@/model/history/sim/people/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { SocietyEra } from "@/model/society/types"

export interface HistoryRunOptions {
	seed: number
	era: SocietyEra
	numPoints: number
	years: number
	summaryPath: string
	log: (line: string) => void
	// [JUSTIFICATION] Only invariant tests observe each simulated year.
	onYear?: (params: YearHookParams) => void
}

export interface YearHookParams {
	engine: EngineState
	record: RecordState
	frame: WorldFrame
	year: number
}

export interface CreateEngineParams {
	seed: number
	era: SocietyEra
	numPoints: number
}

export interface CreatedEngine {
	generated: ReturnType<typeof GENERATE_WORLD.generateGenesisWorld>
	engine: EngineState
	generationMs: number
	initMs: number
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
	peopleAlive: number
	peopleLogRows: number
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

export type SyntheticPeopleEvent =
	| { kind: "birth"; time: number; pregnancy: Pregnancy }
	| { kind: "wedding"; time: number; wedding: Wedding }
	| { kind: "death"; time: number; death: ScheduledDeath }
