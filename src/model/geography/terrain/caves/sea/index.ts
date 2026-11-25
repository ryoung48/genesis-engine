import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import type { SeaPotentialParams } from "@/model/geography/terrain/caves/sea/types"
import { SHORE } from "@/model/geography/terrain/shore"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"
import { MATH } from "@/model/shared/math/core"

function potential({ label, exposureOpenM }: SeaPotentialParams): Float32Array {
	const out = new Float32Array(label.length)
	for (let r = 0; r < label.length; r++) {
		let term = 0
		if (label[r] === SHORE.labelCode.cliff) term = 1
		else if (label[r] === SHORE.labelCode.rockyShore)
			term = CAVE_CONFIG.seaRockyTerm
		if (term === 0) continue
		out[r] =
			term *
			MATH.ramp({ range: SHORE_CONFIG.exposureEdgesM, x: exposureOpenM[r] })
	}
	return out
}

export const SEA_CAVE = { potential }
