import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface FixtureParams {
	neighbors: number[][]
	desolate: number[]
	seed: number
}

export interface GroupsParams {
	world: SerializedGenesisWorld
	groups: number[][]
}
export interface EngineFixtureParams extends GroupsParams {
	year: number
}
