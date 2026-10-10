import type { WorldFrame } from "@/model/history/world-frame/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
export interface RoadDisplayParams {
	world: SerializedGenesisWorld
	frame: WorldFrame
	visible: boolean
}
