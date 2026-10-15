import type { SphereMesh } from "@/model/mesh/types"

export interface SeaLink {
	a: number
	b: number
	distanceKm: number
}

export interface SeaLinksParams {
	mesh: Pick<SphereMesh, "numRegions" | "r_xyz" | "adjOffset" | "adjList">
	water: Uint8Array
	regionProvince: Int32Array
	active: Uint8Array
	planetRadiusKm: number
}

export interface SeaLinksResult {
	links: SeaLink[]
	waterEdgeLengths: number[]
}
