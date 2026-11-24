import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { SimSpace } from "@/model/geography/tectonics/sim-mesh/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { Vec3 } from "@/model/shared/math/vec3/types"

export type VolcanoKind = "hotspot" | "arc" | "andean"

export interface VolcanoSite {
	cell: number
	kind: VolcanoKind
	heightKm: number
	radiusKm: number
	ageMyr: number
	strike: Vec3 | null
	floorKm: number | null
	active: boolean
}

export interface Edifice {
	kind: VolcanoKind
	active: boolean
	pos: Vec3
	axis: Vec3
	heightKm: number
	radiusKm: number
	rounded: number
	aspect: number
	reachKm: number
	ribFade: number
	floorKm: number | null
	shape: Float32Array
}

export interface HotspotSitesParams {
	crust: CrustRaster
	seaAgeMyr: Float32Array
}

export interface BuildEdificesParams {
	space: SimSpace
	sites: VolcanoSite[]
	seed: number
	meshEdgeKm: number
}

export interface StampEdificesParams {
	mesh: SphereMesh
	planetRadiusKm: number
	edifices: Edifice[]
	seed: number
	heightKm: Float32Array
}

export interface StampResult {
	addedKm: Float32Array
	hotspotKm: Float32Array
	kindAt: Uint8Array
	activity: Float32Array
	count: number
}

export interface ConeAtParams {
	edifice: Edifice
	px: number
	py: number
	pz: number
	groundKm: number
	radiusKm: number
	noise: { noise3D: (x: number, y: number, z: number) => number }
}

export interface HotspotExposureSummary {
	threshold: number
	activeCells: number
	aboveWaterBeforeFlood: number
	aboveWaterAfterFlood: number
}

export interface GenesisVolcanism {
	hotspot: Float32Array
	// [JUSTIFICATION]: filled after the final land mask exists, so the stamper cannot supply it.
	hotspotExposure?: HotspotExposureSummary
}
