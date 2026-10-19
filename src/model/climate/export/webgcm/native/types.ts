import type { WebgcmExportProgress } from "@/model/climate/export/webgcm/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface ExportNativeWorldInput {
	world: NativeExportWorld
	onProgress: (progress: WebgcmExportProgress) => void
}

export type NativeExportWorld = Pick<
	SerializedGenesisWorld,
	"mesh" | "isLand" | "elevation_km"
> & {
	params: Pick<
		SerializedGenesisWorld["params"],
		"planetRadiusKm" | "hoursPerDay"
	>
}

export interface NativeWorldGeometry {
	mesh: SphereMesh
	land: Uint8Array
	elevationKm: Float32Array
	radiusM: number
}

export interface NativeWorldFile {
	format: "chaos-native-world-v1"
	input: NativeWorldGeometry
	rotationSeconds: number
}
