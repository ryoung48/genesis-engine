import type { GenesisCaveSites } from "@/model/geography/terrain/caves/types"
import type { DotSymbolData } from "@/ui/genesis/renderer/types"

export function buildCaveSymbolData(sites: GenesisCaveSites): DotSymbolData {
	return {
		r_xyz: sites.xyz,
		key: sites.type,
		side: new Int8Array(sites.type.length),
	}
}
