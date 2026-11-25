import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import type { LavaPotentialParams } from "@/model/geography/terrain/caves/lava/types"
import { ROCKS } from "@/model/geography/terrain/rocks"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"
import { MATH } from "@/model/shared/math/core"

function potential({ rock, volcano }: LavaPotentialParams): Float32Array {
	const out = new Float32Array(rock.length)
	const floor = CAVE_CONFIG.oldBasaltFloor
	for (let r = 0; r < rock.length; r++)
		if (rock[r] === ROCKS.code.basalt)
			out[r] =
				floor +
				(1 - floor) *
					MATH.smoothstep({
						edge0: 0,
						edge1: SHORE_CONFIG.volcanicSandActivity,
						x: volcano[r],
					})
	return out
}

export const LAVA_CAVE = { potential }
