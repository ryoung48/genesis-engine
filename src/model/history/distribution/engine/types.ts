import type { AttackState } from "@/model/history/distribution/attacks/types"
import type { CradleState } from "@/model/history/distribution/cradles/types"
import type { MigrationResult } from "@/model/history/distribution/migration/types"
import type { RecordBatch } from "@/model/history/distribution/record/types"
import type { SettlementState } from "@/model/history/distribution/settlement/types"
import type { Foundings } from "@/model/history/distribution/statehood/types"
import type {
	DistributionProjection,
	Histogram,
} from "@/model/history/distribution/targets/projection/types"
import type { Territory } from "@/model/history/distribution/territory/types"
import type { HistoryState } from "@/model/history/record/types"
import type { SharedRng } from "@/model/shared/random/rng"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface DistributionEngine {
	territory: Territory
	migration: MigrationResult
	cradles: CradleState
	provincePositions: Float32Array
	planetRadiusKm: number
	habitableCount: number
	executionStepCount: number
	endpointClampExtraSteps: number
	preStatePoliticalSteps: number
	preStateAdvanceMs: number
	politicalAdvanceMs: number
	settlementEvents: number
	unmetDemand: number
	foundingViolations: number
	attacks: AttackState
	rng: SharedRng
	year: number
	target: DistributionProjection
	history: HistoryState
	settlement: SettlementState
	siteScore: Float32Array
	foundings: Foundings
	sequence: number
	pending: RecordBatch[]
	advanceMs: number
	projectionMs: number
	recordWritingMs: number
	recordIngestionMs: number
	rebellions: SplitRebellion[]
	splits: number
	absorptions: number
}
export interface CreateEngineParams {
	world: SerializedGenesisWorld
}
export interface EngineParams {
	engine: DistributionEngine
}
export interface AdvanceParams {
	engine: DistributionEngine
	year: number
}
export interface EngineSplitParams {
	engine: DistributionEngine
	countryId: number
	mandatory: boolean
	observed: Histogram
}
export interface PlaybackParams {
	engine: DistributionEngine
	isCurrent: () => boolean
	isRunning: () => boolean
	onBatch: (batch: RecordBatch) => void
	onPaused: (timeMs: number) => void
	yieldYear: () => Promise<void>
	batchYears: number
}

export interface SplitRebellion {
	id: number
	parent: number
	successor: number
	province: number
}

export interface StepEngineParams {
	engine: DistributionEngine
	endpoint: number
}
