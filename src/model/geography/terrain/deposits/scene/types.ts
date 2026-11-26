import type { ClimateTests } from "@/model/geography/terrain/deposits/climate-tests/types"
import type { DistrictShapes } from "@/model/geography/terrain/deposits/districts/types"
import type { GroundFields } from "@/model/geography/terrain/deposits/ground/types"
import type { HostTables } from "@/model/geography/terrain/deposits/hosts/types"
import type { RecordFields } from "@/model/geography/terrain/deposits/record/types"
import type { SystemId } from "@/model/geography/terrain/deposits/systems/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface SceneFields {
	record: RecordFields
	acrossKm: Float32Array
	beltW: Float32Array
	axisX: Float32Array
	axisY: Float32Array
	axisZ: Float32Array
	edge: Float32Array
	anyRecord: Float32Array
	anyGem: Float32Array
}

export interface PlacerSources {
	gold: Float32Array
	tin: Float32Array
	diamond: Float32Array
	gem: Float32Array
}

export interface Spot {
	noise: (x: number, y: number, z: number) => number
	kimberliteFreq: number
	reefFreq: number
}

export interface Scene {
	mesh: SphereMesh
	numRegions: number
	rows: Uint8Array
	scale: Float32Array
	stretch: Float32Array
	shapes: DistrictShapes
	spot: Spot
	fields: SceneFields
	hosts: HostTables
	tests: ClimateTests
	ground: GroundFields
	rock: Uint8Array
	youngKind: Uint8Array
	glaciated: Uint8Array
	lakeKind: Uint8Array
	sand: Float32Array
	coastal: Uint8Array
	sources: PlacerSources
}

export interface Here {
	region: number
	cell: number
	rock: number
	young: boolean
	erg: boolean
	till: boolean
	glaciated: boolean
	porphyry: number
	vms: number
	skarn: number
	mvt: number
	sedex: number
	marble: number
	coal: number
}

export interface BeginParams {
	here: Here
	region: number
	cell: number
	rock: number
	young: boolean
	erg: boolean
	till: boolean
	glaciated: boolean
}

export interface PutParams {
	scene: Scene
	region: number
	system: SystemId
	value: number
}

export interface StretchParams {
	value: number
	factor: number
}

export interface DistrictParams {
	scene: Scene
	region: number
	system: SystemId
	value: number
}

export interface SpotParams {
	scene: Scene
	value: number
	frequency: number
	edges: readonly [number, number]
	offset: number
}

export interface PlaceParams {
	scene: Scene
	here: Here
}

export interface SystemValue {
	system: SystemId
	value: number
}

export interface LakeParams {
	scene: Scene
	region: number
}
