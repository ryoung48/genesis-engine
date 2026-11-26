import type { GroundwaterLayers } from "@/model/geography/terrain/groundwater/types"
import type {
	ShoreExposure,
	ShoreExposureClass,
} from "@/model/geography/terrain/shore/exposure/types"
import type { ShoreMaterial } from "@/model/geography/terrain/shore/material/types"
import type { ShoreRelief } from "@/model/geography/terrain/shore/relief/types"
import type { ShoreSetting } from "@/model/geography/terrain/shore/setting/types"
import type { SphereMesh } from "@/model/mesh/types"

export type ShoreHabitat = "none" | "mangrove" | "saltMarsh" | "tidalFlat"

export type ShoreLabel =
	| "none"
	| "iceCoast"
	| "mangroveCoast"
	| "saltMarshCoast"
	| "tidalFlat"
	| "deltaCoast"
	| "estuaryCoast"
	| "cliff"
	| "rockyShore"
	| "gravelBeach"
	| "blackSandBeach"
	| "sandyBeach"
	| "muddyShore"

export interface ShoreLayers {
	exposureOpenM: Float32Array
	exposureLeeM: Float32Array
	relief: Uint8Array
	material: Uint8Array
	volcanicSand: Uint8Array
	habitat: Uint8Array
	setting: Uint8Array
	label: Uint8Array
}

export interface ShoreStats {
	coastalRegions: number
	label: Record<ShoreLabel, number>
	exposureOpen: Record<ShoreExposureClass, number>
	exposureLee: Record<ShoreExposureClass, number>
	relief: Record<ShoreRelief, number>
	material: Record<ShoreMaterial, number>
	habitat: Record<ShoreHabitat, number>
	setting: Record<ShoreSetting, number>
	volcanicSand: number
	stageMs: number
}

export interface ShoreResult {
	layers: ShoreLayers
	stats: ShoreStats
}

export interface ShoreClassifyParams {
	mesh: SphereMesh
	isLand: Uint8Array
	openWater: Uint8Array
	elevationKm: Float32Array
	planetRadiusKm: number
	exposure: ShoreExposure
	rock: Uint8Array
	youngKind: Uint8Array
	glaciated: Uint8Array
	pastaClimate: Uint8Array
	groundwater: Pick<
		GroundwaterLayers,
		"sand" | "wetlandKind" | "coastFlag" | "wetCoast"
	>
	flow: Float32Array
	tidalRange: Float32Array
	volcano: Float32Array
}

export interface HabitatOfParams {
	isIce: boolean
	wetlandKind: number
	coastFlag: number
	wetCoast: number
	leeClass: number
	relief: number
	sandShare: number
	tidalRangeM: number
}

export interface LabelOfParams {
	material: number
	volcanicSand: boolean
	relief: number
	openClass: number
	habitat: number
	setting: number
}

export interface ShoreStatsParams {
	layers: ShoreLayers
	stageMs: number
}
