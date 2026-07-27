import type { HistoryRng } from "@/model/history/history-rng/types"
import type { HistoryState } from "@/model/history/state/types"
import type { GenesisNationHierarchy } from "@/model/society/types"

export interface SeedColonyRelationsParams {
	state: HistoryState
	nations: GenesisNationHierarchy | undefined
}

export interface ProcessEventsUntilParams {
	state: HistoryState
	targetTime: number
	rng: HistoryRng
	validate: boolean
}
