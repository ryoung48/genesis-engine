import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import type {
	CarryParams,
	PlacerFactorParams,
} from "@/model/geography/terrain/deposits/placers/types"
import { MATH } from "@/model/shared/math/core"

const C = DEPOSIT_CONFIG

function carry({
	mesh,
	planetRadiusKm,
	isLand,
	drainTarget,
	processOrder,
	source,
	lengthKm,
}: CarryParams): Float32Array {
	const { r_xyz } = mesh
	for (let i = processOrder.length - 1; i >= 0; i--) {
		const c = processOrder[i]
		const d = drainTarget[c]
		if (d < 0 || !isLand[d] || !(source[c] > 0)) continue
		const step =
			planetRadiusKm *
			Math.hypot(
				r_xyz[3 * d] - r_xyz[3 * c],
				r_xyz[3 * d + 1] - r_xyz[3 * c + 1],
				r_xyz[3 * d + 2] - r_xyz[3 * c + 2],
			)
		const value = source[c] * Math.exp(-step / lengthKm)
		if (value > source[d]) source[d] = value
	}
	return source
}

function factor({
	discharge,
	rough,
	glaciated,
	till,
}: PlacerFactorParams): number {
	const flow = MATH.ramp({ range: C.placerDischarge, x: discharge })
	if (!(flow > 0)) return 0
	const gentle = MATH.ramp({ range: C.placerGentle, x: rough })
	const ice = glaciated
		? C.placerIce.glaciated
		: 1 - (till ? C.placerIce.margin : 0)
	return flow * (0.5 + 0.5 * gentle) * ice
}

export const PLACERS = { carry, factor }
