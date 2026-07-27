import type { Eu4ProvinceMap } from "@/model/earth/history/import/eu4-province-map/types"
import type { GenesisProvinces } from "@/model/society/types"

function buildEu4ProvinceMap(
	provinces: GenesisProvinces,
): Eu4ProvinceMap | null {
	if (!provinces.realIds) return null
	const realIdToCompact = new Map<string, number>()
	for (let i = 0; i < provinces.realIds.length; i++) {
		realIdToCompact.set(String(provinces.realIds[i]), i)
	}
	return { compactToRealId: provinces.realIds, realIdToCompact }
}

export const EU4_PROVINCE_MAP = {
	buildEu4ProvinceMap,
}
