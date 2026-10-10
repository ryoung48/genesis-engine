import type { RefObject } from "react"
import type { RecordBatch } from "@/model/history/distribution/record/types"
import type { HistoryState } from "@/model/history/record/types"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import type { GenesisParams } from "@/model/pipelines/types"
import type {
	GenesisWorkerResponse,
	InfrastructureResult,
	ProceduralHistoryInitial,
	SerializedGenesisWorld,
} from "@/model/worker-protocol/types"
import type { ReligionMapMode } from "@/ui/genesis/shared/map-modes"

export interface HistoryTimelineInput {
	world: SerializedGenesisWorld | null
	religionMode: ReligionMapMode
	journalTransactionsRef: RefObject<JournalTransaction[]>
	journalVersion: number
	distributionStateRef: RefObject<HistoryState | null>
	distributionBatchesRef: RefObject<RecordBatch[]>
}

export interface EarthTimelineInput {
	provinces: SerializedGenesisWorld["provinces"] | null | undefined
	isEarthImport: boolean
}

export interface GenerationCallbacks {
	setGenerating: (v: boolean) => void
	setGenerationProgress: (v: number | ((current: number) => number)) => void
	setGenerationLabel: (v: string) => void
	setSeed: (v: number) => void
	setWorld: (v: SerializedGenesisWorld | null) => void
	workerRef: React.MutableRefObject<Worker | null>
	onHistoryStart: (initial: ProceduralHistoryInitial | null) => void
	onDistributionBatch: (batch: RecordBatch) => void
	onHistoryStopped: (complete: boolean) => void
	onHistoryJournal: (journal: JournalTransaction[]) => void
	// [JUSTIFICATION] Only callers with a completion action supply one.
	onGenerationComplete?: () => void
	// [JUSTIFICATION] Pathfinding callbacks are absent when no map interaction is mounted.
	onPathfindResult?: (result: {
		pathRegions: Int32Array
		distanceKm: number
		landKm: number
		seaKm: number
		travelDays: number
		reachable: boolean
	}) => void
	// [JUSTIFICATION] Infrastructure is requested only by callers that render it.
	onInfrastructureResult?: (result: InfrastructureResult) => void
}

export type GenerationParams = GenesisParams

export interface GenerateWorldParams {
	overrideSeed: number
	overrides: Partial<GenerationParams> | undefined
	currentParams: GenerationParams
	callbacks: GenerationCallbacks
}
export interface GenerateOverrideParams {
	seed: number
	overrides: Partial<GenerationParams> | undefined
}

export interface CreateWorkerParams {
	callbacks: GenerationCallbacks
	onDone: (message: GenesisWorkerResponse & { type: "done" }) => void
	failLabel: string
}
