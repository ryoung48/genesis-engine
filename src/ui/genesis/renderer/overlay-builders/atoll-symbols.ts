import { CAVES } from "@/model/geography/terrain/caves"
import type { GenesisAtolls } from "@/model/geography/terrain/seabed/atolls/types"
import type { DotSymbolData } from "@/ui/genesis/renderer/types"

export const ATOLL_DOT_KEY = CAVES.types.length

export function buildAtollSymbolData(atolls: GenesisAtolls): DotSymbolData {
	return {
		r_xyz: atolls.xyz,
		key: new Uint8Array(atolls.region.length).fill(ATOLL_DOT_KEY),
		side: new Int8Array(atolls.region.length),
	}
}
