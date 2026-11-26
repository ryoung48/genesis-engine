import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { SimMesh } from "@/model/geography/tectonics/sim-mesh/types"
import type { WorldSample } from "@/model/geography/tectonics/world-sample/types"
import type { DepositShares } from "@/model/geography/terrain/deposits/commodities/types"
import type { GrainFields } from "@/model/geography/terrain/deposits/grain/types"
import type { RecordFields } from "@/model/geography/terrain/deposits/record/types"
import type { Scene } from "@/model/geography/terrain/deposits/scene/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface DepositsParams {
	mesh: SphereMesh
	seed: number
	planetRadiusKm: number
	crust: CrustRaster
	simMesh: SimMesh
	sample: WorldSample
	isLand: Uint8Array
	elevationKm: Float32Array
	rock: Uint8Array
	youngKind: Uint8Array
	glaciated: Uint8Array
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
	flow: Float32Array
	lakeKind: Uint8Array
	coastal: Uint8Array
	sand: Float32Array
}

export interface GenesisDeposits {
	rows: Uint8Array
	shares: DepositShares
	landRegions: number
}

export interface RegionCellsParams {
	mesh: SphereMesh
	simMesh: SimMesh
	sample: WorldSample
	land: Uint8Array
}

export interface EdgePassesParams {
	numCells: number
	planetRadiusKm: number
}

export interface GridDegreesParams {
	numRegions: number
	planetRadiusKm: number
}

export interface SceneFieldsParams {
	record: RecordFields
	grain: GrainFields
	land: Uint8Array
	numCells: number
	passes: number
	mesh: SphereMesh
}

export interface PlacersParams {
	scene: Scene
	params: DepositsParams
}
