import type { SerializedGenesisWorld } from "@/model/transport/worker-types"

export interface RegionTimezoneOffsetParams {
	world: SerializedGenesisWorld
	region: number
}

export interface RegionTimezoneLabelParams {
	world: SerializedGenesisWorld
	region: number
}
