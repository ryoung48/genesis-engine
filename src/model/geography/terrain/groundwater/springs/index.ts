import type { SpringsParams } from "@/model/geography/terrain/groundwater/springs/types"
import type { SpringKind } from "@/model/geography/terrain/groundwater/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG

const kinds: readonly SpringKind[] = [
	"none",
	"seepage",
	"contact",
	"karst",
	"piedmont",
]

const code: Record<SpringKind, number> = {
	none: 0,
	seepage: 1,
	contact: 2,
	karst: 3,
	piedmont: 4,
}

function classify({
	qem,
	qin,
	qkarst,
	dry,
	seepShare,
	slope,
	active,
}: SpringsParams): Uint8Array {
	const out = new Uint8Array(qem.length)
	for (let r = 0; r < qem.length; r++) {
		if (!active[r]) continue
		if (qem[r] >= C.springMinM3s) {
			if (qkarst[r] / qin[r] >= C.karstShare) out[r] = code.karst
			else out[r] = dry[r] ? code.piedmont : code.contact
		} else if (seepShare[r] >= C.seepMin && slope[r] >= C.springSlope)
			out[r] = code.seepage
	}
	return out
}

export const SPRINGS = { kinds, code, classify }
