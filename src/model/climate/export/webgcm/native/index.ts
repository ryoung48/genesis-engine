import { NATIVE_PACKET } from "@/model/climate/export/webgcm/native/packet/index.mjs"
import type { ExportNativeWorldInput } from "@/model/climate/export/webgcm/native/types"

async function createFile({ world, onProgress }: ExportNativeWorldInput) {
	onProgress({ percent: 0, label: "Preparing native cells" })
	await new Promise<void>((resolve) => setTimeout(resolve, 0))
	const { mesh, isLand, elevation_km, params } = world
	if (
		mesh.numRegions !== isLand.length ||
		mesh.numRegions !== elevation_km.length
	) {
		throw new Error("The native world has incomplete geography")
	}
	const result = NATIVE_PACKET.encode({
		value: {
			format: "chaos-native-world-v1",
			input: {
				mesh,
				land: isLand,
				elevationKm: elevation_km,
				radiusM: params.planetRadiusKm * 1000,
			},
			rotationSeconds: params.hoursPerDay * 3600,
		},
	})
	onProgress({ percent: 100, label: "Native world ready" })
	return result
}

export const WEBGCM_NATIVE = { createFile }
