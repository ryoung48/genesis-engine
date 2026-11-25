import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import type { SinkholePotentialParams } from "@/model/geography/terrain/caves/sinkhole/types"
import { KARST } from "@/model/geography/terrain/karst"
import { MATH } from "@/model/shared/math/core"

function potential({ kind, water }: SinkholePotentialParams): Float32Array {
	const out = new Float32Array(kind.length)
	for (let r = 0; r < kind.length; r++)
		if (kind[r] === KARST.kindCode.carbonate)
			out[r] = MATH.ramp({ range: CAVE_CONFIG.sinkWet, x: water[r] })
	return out
}

export const SINKHOLE_CAVE = { potential }
