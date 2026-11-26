import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import type {
	GroundFields,
	GroundParams,
	GroundTerms,
	GroundTermsParams,
} from "@/model/geography/terrain/deposits/ground/types"
import { MATH } from "@/model/shared/math/core"
import { SPREAD } from "@/model/shared/spread"

const G = DEPOSIT_CONFIG.ground
const BS = DEPOSIT_CONFIG.buildingStone

function compute({
	mesh,
	planetRadiusKm,
	elevationKm,
	isLand,
}: GroundParams): GroundFields {
	const n = mesh.numRegions
	const cellKm = Math.sqrt((4 * Math.PI * planetRadiusKm * planetRadiusKm) / n)
	const passes = (km: number) => Math.max(1, Math.round(km / cellKm))
	const reliefPasses = passes(G.reliefKm)
	const roughPasses = passes(G.roughKm)
	const land = Float32Array.from(elevationKm, (z, r) => (isLand[r] ? z : 0))
	const square = Float32Array.from(land, (z) => z * z)
	const mean = SPREAD.neighbourAverage({
		mesh,
		field: land,
		include: isLand,
		passes: roughPasses,
	})
	const around =
		reliefPasses === roughPasses
			? mean
			: SPREAD.neighbourAverage({
					mesh,
					field: land,
					include: isLand,
					passes: reliefPasses,
				})
	const meanSquare = SPREAD.neighbourAverage({
		mesh,
		field: square,
		include: isLand,
		passes: roughPasses,
	})
	const relief = new Float32Array(n)
	const rough = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!isLand[r]) continue
		relief[r] = elevationKm[r] - around[r]
		rough[r] = Math.sqrt(Math.max(0, meanSquare[r] - mean[r] * mean[r]))
	}
	return { relief, rough }
}

function terms({ relief, rough, plain }: GroundTermsParams): GroundTerms {
	return {
		gentle: MATH.ramp({ range: G.gentle, x: rough }),
		flat: MATH.ramp({ range: G.flat, x: rough }),
		hills: MATH.ramp({ range: BS.hillsRough, x: rough }),
		crust:
			MATH.ramp({ range: G.crustRelief, x: relief }) *
			(plain ? G.crustOnPlain : 1),
		lowFloor: Math.max(
			MATH.ramp({ range: G.floorRelief, x: relief }),
			plain ? 1 : 0,
		),
		pan: MATH.ramp({ range: G.panRelief, x: relief }),
	}
}

export const GROUND = { compute, terms }
