import type { GenesisProvinces } from "@/model/types/society"

export interface ComputeCulturesParams {
	provinces: Pick<
		GenesisProvinces,
		"count" | "desolate" | "adjOffset" | "adjList"
	>
	seed: number
	settledMask?: Uint8Array
}
