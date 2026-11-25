import type { GenesisClimate, GenesisRainfall } from "@/model/climate/types"
import type {
	CaveType,
	GenesisCaveSites,
} from "@/model/geography/terrain/caves/types"
import type { GroundwaterLayers } from "@/model/geography/terrain/groundwater/types"
import type {
	KarstActivity,
	KarstKind,
} from "@/model/geography/terrain/karst/types"
import type { GenesisSurface } from "@/model/geography/terrain/rocks/types"
import type { ShoreLayers } from "@/model/geography/terrain/shore/types"
import type { SphereMesh } from "@/model/mesh/types"

export type KarstClass = "none" | "absent" | "short" | "long" | "pseudo"

export interface GenesisKarst {
	kind: Uint8Array
	karstClass: Uint8Array
	activity: Uint8Array
	potential: Float32Array
}

export interface KarstCavesStats {
	landRegions: number
	kindShare: Record<KarstKind, number>
	classShare: Record<KarstClass, number>
	activityShare: Record<KarstActivity, number>
	presenceShare: Record<CaveType, number>
	siteShare: Record<CaveType, number>
	sitesPer100: number
	longSolutionShare: number
	stageMs: number
}

export interface KarstCavesResult {
	karst: GenesisKarst
	sites: GenesisCaveSites
	stats: KarstCavesStats
}

export interface KarstCavesComputeParams {
	mesh: SphereMesh
	seed: number
	isLand: Uint8Array
	openWater: Uint8Array
	surface: Pick<GenesisSurface, "rock" | "bedrock" | "glaciated">
	groundwater: Pick<GroundwaterLayers, "spring">
	shore: Pick<ShoreLayers, "label" | "exposureOpenM">
	volcano: Float32Array
	topography: Uint8Array
	slopeScore: Float32Array
	iceThickness: Float32Array
	climate: Pick<
		GenesisClimate,
		"temperature_monthly" | "temperature_avg" | "pet_monthly"
	>
	rainfall: Pick<GenesisRainfall, "annual">
}

export interface KarstClassOfParams {
	kind: number
	potential: number
	lava: number
	slopeScore: number
}

export interface KarstShareParams<K extends string> {
	names: readonly K[]
	codes: Uint8Array
	isLand: Uint8Array
	count: number
}

export interface KarstCavesStatsParams {
	isLand: Uint8Array
	shoreLabel: Uint8Array
	karst: GenesisKarst
	potentials: Float32Array[]
	sites: GenesisCaveSites
	long: Uint8Array
	stageMs: number
}
