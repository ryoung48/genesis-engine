import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface BuildProceduralStateParams {
	world: SerializedGenesisWorld
	startTimeMs: number
}
