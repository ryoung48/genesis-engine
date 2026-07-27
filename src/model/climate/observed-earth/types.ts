import type { SphereMesh } from "@/model/types/mesh"

export type SampleMonthlyFloatRasterParams = {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	months: number
	scale: number
	nodata: number
}
