import type { ComputeProvinceWaterAccessParams } from "@/model/society/water-access/types"

const waterAccessBonus = 100

function computeProvinceWaterAccess({
	provinces,
	oceanCoastal,
	lakeCoastal,
	riverVisible,
}: ComputeProvinceWaterAccessParams): {
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

export const WATER_ACCESS = {
	waterAccessBonus,
	computeProvinceWaterAccess,
}
