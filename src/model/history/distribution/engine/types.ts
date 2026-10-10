import type { AttackState } from "@/model/history/distribution/attacks/types"
import type { RecordBatch } from "@/model/history/distribution/record/types"
import type {
	DistributionProjection,
	Histogram,
} from "@/model/history/distribution/targets/types"
import type { Territory } from "@/model/history/distribution/territory/types"
import type { HistoryState } from "@/model/history/record/types"
import type { SharedRng } from "@/model/shared/random/rng"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface DistributionEngine {
	territory: Territory
	attacks: AttackState
	rng: SharedRng
	year: number
	target: DistributionProjection
	history: HistoryState
	sequence: number
	pending: RecordBatch[]
	advanceMs: number
	projectionMs: number
	recordWritingMs: number
	recordIngestionMs: number
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
