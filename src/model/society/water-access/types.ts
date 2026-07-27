import type { GenesisProvinces } from "@/model/types/society"

export interface ComputeProvinceWaterAccessParams {
	provinces: Pick<GenesisProvinces, "count" | "regionProvince">
	oceanCoastal: Uint8Array<ArrayBufferLike>
	lakeCoastal: Uint8Array<ArrayBufferLike>
	riverVisible: Uint8Array<ArrayBufferLike>
}
