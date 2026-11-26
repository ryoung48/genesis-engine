import { LAKES } from "@/model/geography/terrain/lakes"
import { MATH } from "@/model/shared/math/core"
import type {
	GroundFactorParams,
	GroundFits,
	GroundFitsParams,
	ProvinceGround,
	ProvinceGroundParams,
	TerraceShareParams,
} from "@/model/society/farming/ground/types"

// The ramps run over the terrain classes' own slope score so farming and the
// map's hill and mountain labels agree. The plough starts losing land where
// topography starts calling land hill (score 0.2) and has lost the most where
// any land over 0.5 km is mountain (0.6). Terraces hold the loss off until the
// lowest score at which land becomes mountain (0.3) and reach the most at the
// score's maximum.
const PLOUGH_SLOPE = { edge0: 0.2, edge1: 0.6 }
const TERRACE_SLOPE = { edge0: 0.3, edge1: 1 }
// 8% of the steepest ground stays farmable (garden plots); upstream
// raguilar011095/planet_heightmap_generation at commit ed466f9d, slopeMaxLoss.
const MAX_SLOPE_LOSS = 0.92
// Average ground loses nothing: only fertility below this loses land share. The
// parent-material table puts average rock and soil at 0.5, which is upstream's
// value for ground of unknown kind (farming-config.js parent.unknown).
const SOIL_REF = 0.5
// Topography's hill rule (elevation > 0.1 km): lower land is flat at any score.
const LOW_LAND_KM = 0.1
// Terraces come in between the 3rd millennium BCE highland terraces of Yemen
// (average tech level 0.5, about -3000 on the Earth timeline) and the dated
// terrace settlements of southern Peru (1.6, about -250). See
// plans/farming-slope-terraces.md.
const TERRACE_TECH = { edge0: 0.5, edge1: 1.6 }

function groundFactor({ slope, edges }: GroundFactorParams): number {
	return 1 - MAX_SLOPE_LOSS * MATH.smoothstep({ ...edges, x: slope })
}

function soilFactor(fertility: number): number {
	return Math.max(1 - MAX_SLOPE_LOSS, Math.min(1, fertility / SOIL_REF))
}

function provinceGround({
	provinces,
	mesh,
	elevationKm,
	slopeScore,
	soilFertility,
	lakeKind,
}: ProvinceGroundParams): ProvinceGround {
	const count = provinces.count
	const area = new Float64Array(count)
	const plough = new Float64Array(count)
	const terrace = new Float64Array(count)
	const soil = new Float64Array(count)
	for (let r = 0; r < mesh.numRegions; r++) {
		const p = provinces.regionProvince[r]
		if (p < 0) continue
		const a = mesh.regionArea[r]
		const low = elevationKm[r] <= LOW_LAND_KM
		area[p] += a
		plough[p] +=
			a *
			(low ? 1 : groundFactor({ slope: slopeScore[r], edges: PLOUGH_SLOPE }))
		terrace[p] +=
			a *
			(low ? 1 : groundFactor({ slope: slopeScore[r], edges: TERRACE_SLOPE }))
		soil[p] +=
			a *
			(lakeKind[r] === LAKES.kindCode.pan
				? 1 - MAX_SLOPE_LOSS
				: soilFertility
					? soilFactor(soilFertility[r])
					: 1)
	}
	return {
		plough: Float32Array.from(plough, (v, p) =>
			area[p] > 0 ? v / area[p] : 1,
		),
		terrace: Float32Array.from(terrace, (v, p) =>
			area[p] > 0 ? v / area[p] : 1,
		),
		soil: Float32Array.from(soil, (v, p) => (area[p] > 0 ? v / area[p] : 1)),
	}
}

function fits({ climateFit, ground }: GroundFitsParams): GroundFits {
	const soilFit = Float64Array.from(
		climateFit,
		(fit, p) => fit * ground.soil[p],
	)
	return {
		cropFit: Float64Array.from(soilFit, (fit, p) => fit * ground.plough[p]),
		terraceFit: Float32Array.from(
			soilFit,
			(fit, p) => fit * (ground.terrace[p] - ground.plough[p]),
		),
	}
}

function terraceShare({ techLevel }: TerraceShareParams): number {
	return MATH.smoothstep({ ...TERRACE_TECH, x: techLevel })
}

export const FARMING_GROUND = { provinceGround, fits, terraceShare }
