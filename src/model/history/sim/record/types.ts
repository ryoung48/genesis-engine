import type { LonLat } from "@/model/history/earth/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface BuildProceduralStateParams {
	world: SerializedGenesisWorld
	startTimeMs: number
	// [JUSTIFICATION] callers without per-province lon/lat (e.g. tests) get a
	// zero-filled fallback; only the map hover bridge reads these.
	provinceCoords: LonLat[] | undefined
}
