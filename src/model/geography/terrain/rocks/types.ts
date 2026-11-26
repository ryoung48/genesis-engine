import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { OldFloodBasalts } from "@/model/geography/tectonics/geologic-record/types"
import type { SimMesh } from "@/model/geography/tectonics/sim-mesh/types"
import type { WorldSample } from "@/model/geography/tectonics/world-sample/types"
import type { ErosionRecord } from "@/model/geography/terrain/erosion/types"
import type { SphereMesh } from "@/model/mesh/types"

export type RockKind =
	| "sea"
	| "young"
	| "sandstone"
	| "shale"
	| "limestone"
	| "salt"
	| "basalt"
	| "volcanic"
	| "granite"
	| "slate"
	| "gneiss"
	| "shield"
	| "greenstone"
	| "ophiolite"

export type YoungKind = "none" | "river" | "loess" | "till" | "erg"

export type RockFamily =
	| "young"
	| "sedimentary"
	| "volcanic"
	| "plutonic"
	| "metamorphic"

export interface RockInfo {
	name: string
	family: RockFamily | null
}

export interface RockClassifyParams {
	mesh: SphereMesh
	planetRadiusKm: number
	seed: number
	crust: CrustRaster
	oldLip: OldFloodBasalts
	simMesh: SimMesh
	sample: WorldSample
	isLand: Uint8Array
	elevation: Float32Array
	elevationKm: Float32Array
	maxElevKm: number
	maxDepthKm: number
	discharge: Float32Array
	erosion: ErosionRecord
	koppen: Uint8Array
	pasta: Uint8Array
	windU: Float32Array
	windV: Float32Array
	temperatureAvg: Float32Array
}

export interface GenesisSurface {
	rock: Uint8Array
	youngKind: Uint8Array
	bedrock: Uint8Array
	glaciated: Uint8Array
	soilFertility: Float32Array
	soilModifier: Uint8Array
}

export interface RockClassification {
	rock: Uint8Array
	youngKind: Uint8Array
	bedrock: Uint8Array
	glaciated: Uint8Array
	rising: Float32Array
}

export interface DespeckleParams {
	mesh: SphereMesh
	rock: Uint8Array
	youngKind: Uint8Array
	eligible: Uint8Array
}
