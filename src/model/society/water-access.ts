import type { GenesisProvinces } from "../types"

export const WATER_ACCESS_BONUS = 100

export function computeProvinceWaterAccess(
	provinces: Pick<GenesisProvinces, "count" | "regionProvince">,
	oceanCoastal: Uint8Array<ArrayBufferLike>,
	lakeCoastal: Uint8Array<ArrayBufferLike>,
	riverVisible: Uint8Array<ArrayBufferLike>,
): {
	waterAccess: Uint8Array
	riverAccess: Uint8Array
	lakeAccess: Uint8Array
} {
	const waterAccess = new Uint8Array(provinces.count)
	const riverAccess = new Uint8Array(provinces.count)
	const lakeAccess = new Uint8Array(provinces.count)
	for (let region = 0; region < provinces.regionProvince.length; region++) {
		const province = provinces.regionProvince[region]
		if (province < 0) continue
		if (oceanCoastal[region]) waterAccess[province] = 2
		else if (lakeCoastal[region] || riverVisible[region])
			waterAccess[province] = 1
		if (riverVisible[region]) riverAccess[province] = 1
		if (lakeCoastal[region]) lakeAccess[province] = 1
	}
	return { waterAccess, riverAccess, lakeAccess }
}
