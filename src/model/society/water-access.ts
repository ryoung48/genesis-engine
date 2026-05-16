import type { OrogenProvinces } from "../types/society"

export const WATER_ACCESS_BONUS = 100

export function computeProvinceWaterAccess(
	provinces: Pick<OrogenProvinces, "count" | "regionProvince">,
	oceanCoastal: Uint8Array<ArrayBufferLike>,
	lakeCoastal: Uint8Array<ArrayBufferLike>,
	riverVisible: Uint8Array<ArrayBufferLike>,
): Uint8Array {
	const waterAccess = new Uint8Array(provinces.count)
	for (let region = 0; region < provinces.regionProvince.length; region++) {
		const province = provinces.regionProvince[region]
		if (province < 0) continue
		if (oceanCoastal[region]) waterAccess[province] = 2
		else if (lakeCoastal[region] || riverVisible[region])
			waterAccess[province] = 1
	}
	return waterAccess
}
