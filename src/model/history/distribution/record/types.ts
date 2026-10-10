import type { DistributionEngine } from "@/model/history/distribution/engine/types"
import type {
	HistoryEvent,
	HistoryState,
	NationEventLog,
	NationIdentity,
	WarRecord,
} from "@/model/history/record/types"
export interface ProvincePatch {
	province: number
	events: HistoryEvent[]
}
export interface NationPatch {
	id: number
	log: NationEventLog
	identity: NationIdentity
}
export interface RecordBatch {
	sequence: number
	lastSequence: number
	throughTimeMs: number
	firstTimeMs: number
	provinces: ProvincePatch[]
	nations: NationPatch[]
	wars: WarRecord[]
}
export interface ConsumeBatchParams {
	state: HistoryState
	batch: RecordBatch
}

export interface MergeBatchesParams {
	batches: RecordBatch[]
}

export interface WriteYearParams {
	engine: DistributionEngine
	oldOwner: Int32Array
	oldIds: Set<number>
}
export interface CapitalOfParams {
	log: NationEventLog
}
