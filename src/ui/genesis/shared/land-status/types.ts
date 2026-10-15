import type { ProvinceStatusName } from "@/model/history/record/status/types"

export type Rgb = [number, number, number]

export interface LandStatusColorParams {
	status: ProvinceStatusName
}

export interface LandStatusLabelParams {
	status: ProvinceStatusName
	settledYear: number
}

export interface StatusAtParams {
	provinceStatus: Uint8Array | null
	province: number
}

export interface PaintUninhabitedParams {
	rgb: Float32Array
	provinceStatus: Uint8Array
	regionProvince: Int32Array
	elevationKm: Float32Array
}
