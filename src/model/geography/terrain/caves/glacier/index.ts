import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import type { GlacierPotentialParams } from "@/model/geography/terrain/caves/glacier/types"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { MATH } from "@/model/shared/math/core"

function potential({
	isLand,
	iceMinMonthly,
	topography,
	warmest,
}: GlacierPotentialParams): Float32Array {
	const out = new Float32Array(isLand.length)
	for (let r = 0; r < isLand.length; r++)
		if (
			isLand[r] &&
			iceMinMonthly[r] > 0 &&
			topography[r] === CLASSIFICATION.topoMountain
		)
			out[r] = MATH.ramp({ range: CAVE_CONFIG.meltC, x: warmest[r] })
	return out
}

export const GLACIER_CAVE = { potential }
