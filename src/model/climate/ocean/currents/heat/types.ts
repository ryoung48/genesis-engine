import type { OceanCirculation } from "@/model/climate/ocean/currents/circulation/types"
import type { OceanGrid } from "@/model/climate/ocean/currents/grid/types"

export type OceanHeatInput = {
	grid: OceanGrid
	circulation: OceanCirculation
	yearSeconds: number
}

export type OceanHeat = {
	delta: Float32Array
	cycleError: number
}
