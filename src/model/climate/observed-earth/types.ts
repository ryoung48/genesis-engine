import type { SphereMesh } from "@/model/mesh/types"

export type SampleMonthlyFloatRasterParams = {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	months: number
	scale: number
	nodata: number
}
