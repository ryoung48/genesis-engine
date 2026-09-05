import type { GenesisObservedCurrent } from "@/model/climate/observed-earth/types"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type BuildOceanCurrentGridParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	oceanCurrents: GenesisOceanCurrents
	month: number | undefined
	params: GenesisParams
}

export type ObservedOceanCurrentGridParams = {
	mesh: SphereMesh
	isLand: Uint8Array
	observedCurrent: GenesisObservedCurrent | undefined
	month: number | undefined
}
