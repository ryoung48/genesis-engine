import type { GenesisProvinces } from "../../../types/society"

export interface Eu4ProvinceMap {
	/** compact province index -> raw EU4 province id */
	compactToRealId: Int32Array
	/** raw EU4 province id (as string, matches provinces.json keys) -> compact index */
	realIdToCompact: Map<string, number>
}

export function buildEu4ProvinceMap(
	provinces: GenesisProvinces,
): Eu4ProvinceMap | null {
	if (!provinces.realIds) return null
	const realIdToCompact = new Map<string, number>()
	for (let i = 0; i < provinces.realIds.length; i++) {
		realIdToCompact.set(String(provinces.realIds[i]), i)
	}
	return { compactToRealId: provinces.realIds, realIdToCompact }
}
