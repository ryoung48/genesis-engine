import type { WebgcmExportInput } from "@/model/climate/export/webgcm/types"
import { MESH } from "@/model/mesh"

const WIDTH = 1440
const HEIGHT = 720
const BYTES_PER_PIXEL = 2
const ROWS_PER_YIELD = 8

async function createRaster({
	mesh,
	elevationKm,
	onProgress,
}: WebgcmExportInput): Promise<ArrayBuffer> {
	if (
		mesh.numRegions < 1 ||
		mesh.r_xyz.length !== mesh.numRegions * 3 ||
		elevationKm.length !== mesh.numRegions
	) {
		throw new Error("Cannot export WebGCM terrain: incomplete world geometry")
	}
	const heights = new Int16Array(mesh.numRegions)
	for (let region = 0; region < mesh.numRegions; region++) {
		const metres = elevationKm[region] * 1000
		if (!Number.isFinite(metres) || metres < -32768 || metres > 32767) {
			throw new Error(
				"WebGCM terrain requires finite elevations between -32768 and 32767 metres",
			)
		}
		heights[region] =
			metres > 0
				? Math.max(1, Math.round(metres))
				: metres < 0
					? Math.min(-1, Math.round(metres))
					: 0
	}
	const index = MESH.buildRegionSpatialIndex(mesh)
	const buffer = new ArrayBuffer(WIDTH * HEIGHT * BYTES_PER_PIXEL)
	const output = new DataView(buffer)
	for (let row = 0; row < HEIGHT; row++) {
		const latitude = 90 - ((row + 0.5) * 180) / HEIGHT
		for (let column = 0; column < WIDTH; column++) {
			const longitude = -180 + ((column + 0.5) * 360) / WIDTH
			const region = index.nearest(longitude, latitude)
			output.setInt16(
				(row * WIDTH + column) * BYTES_PER_PIXEL,
				heights[region],
				true,
			)
		}
		if ((row + 1) % ROWS_PER_YIELD === 0 || row === HEIGHT - 1) {
			onProgress({
				percent: Math.round(((row + 1) * 100) / HEIGHT),
				label: "Sampling WebGCM terrain",
			})
			await new Promise<void>((resolve) => setTimeout(resolve, 0))
		}
	}
	return buffer
}

export const WEBGCM_EXPORT = { createRaster }
