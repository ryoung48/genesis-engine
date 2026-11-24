import type { SphereMesh } from "@/model/mesh/types"

export interface GlacialTillParams {
	mesh: SphereMesh
	planetRadiusKm: number
	isLand: Uint8Array
	glaciated: Uint8Array
	pastIce: Uint8Array
	morainesKm: Float32Array
}
