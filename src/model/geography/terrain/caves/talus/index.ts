import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import type { TalusPotentialParams } from "@/model/geography/terrain/caves/talus/types"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { ROCKS } from "@/model/geography/terrain/rocks"
import { MATH } from "@/model/shared/math/core"

function potential({
	topography,
	slopeScore,
	rock,
}: TalusPotentialParams): Float32Array {
	const out = new Float32Array(rock.length)
	for (let r = 0; r < rock.length; r++) {
		if (topography[r] !== CLASSIFICATION.topoMountain) continue
		if (rock[r] === ROCKS.code.young) continue
		const host = rock[r] === ROCKS.code.shale ? CAVE_CONFIG.talusShale : 1
		out[r] =
			host * MATH.ramp({ range: CAVE_CONFIG.talusSlope, x: slopeScore[r] })
	}
	return out
}

export const TALUS_CAVE = { potential }
