import type { SphereMesh } from "@/model/mesh/types"

export interface WebgcmExportProgress {
	percent: number
	label: string
}

export interface WebgcmExportInput {
	mesh: Pick<SphereMesh, "numRegions" | "r_xyz">
	elevationKm: Float32Array
	onProgress: (progress: WebgcmExportProgress) => void
}
