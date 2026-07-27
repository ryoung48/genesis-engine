import type { SerializedGenesisWorld } from "@/model/transport/types"

export interface RegionTimezoneOffsetParams {
	world: SerializedGenesisWorld
	region: number
}

export interface RegionTimezoneLabelParams {
	world: SerializedGenesisWorld
	region: number
}

export interface SaturateDarkenParams {
	color: readonly [number, number, number]
	sat: number
	dark: number
}
