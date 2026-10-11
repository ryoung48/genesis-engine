import type { StageTiming } from "@/model/shared/timing/types"
import type { GenesisWorkerRequest } from "@/model/worker-protocol/types"

export type GenerationRequest = Extract<
	GenesisWorkerRequest,
	{ type: "generate" | "import" }
>

export interface ProgressCheckpoint {
	stage: string
	atMs: number
}

export interface SavedTimingRun {
	totalMs: number
	checkpoints: ProgressCheckpoint[]
	timings: StageTiming[]
}

export interface TimingCacheEntry {
	key: string
	runs: SavedTimingRun[]
}

export interface CreateProgressParams {
	request: GenerationRequest
	setProgress: (percent: number) => void
	isCurrent: () => boolean
}

export interface UpdateProgressParams {
	stage: string
	percent: number | undefined
}
