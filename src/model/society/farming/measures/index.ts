import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"
import type {
	MeasuresParams,
	MoistureParams,
	NppParams,
	ProvinceMeasures,
	SeasonParams,
} from "@/model/society/farming/measures/types"

const MONTHS = 12
const SPARSE_PASTURE_CREDIT = 0.5
// Open woodland grazes too: European wood pasture and the Iberian dehesa,
// oak savanna, and savanna woodland cattle in Africa and South Asia. Closed
// forest and jungle stay at zero; they support mainly pigs and browsers.
const WOODS_PASTURE_CREDIT = 0.25
const AQUATIC = 2
const FORAGER_FLOOR = 0.01
const FORAGER_SPAN = 0.49
const FORAGER_NPP = { edge0: 250, edge1: 1500 }
const GROWING_SEASON = { edge0: 350, edge1: 1300 }
const CROP_NPP = { edge0: 250, edge1: 900 }
const GRASSLAND = VEGETATION.biomeLabels.indexOf("grasslands")
const SPARSE = VEGETATION.biomeLabels.indexOf("sparse")
const WOODS = VEGETATION.biomeLabels.indexOf("woods")
const PASTURE_CREDIT = new Float64Array(VEGETATION.biomeLabels.length)
PASTURE_CREDIT[GRASSLAND] = 1
PASTURE_CREDIT[SPARSE] = SPARSE_PASTURE_CREDIT
PASTURE_CREDIT[WOODS] = WOODS_PASTURE_CREDIT

function npp({ T, P }: NppParams): number {
	return Math.min(
		3000 / (1 + Math.exp(1.315 - 0.119 * T)),
		3000 * (1 - Math.exp(-0.000664 * P)),
	)
}

function season({ gdd }: SeasonParams): number {
	return MATH.smoothstep({ ...GROWING_SEASON, x: gdd })
}

function moisture({ npp: productivity, floodShare }: MoistureParams): number {
	return Math.max(MATH.smoothstep({ ...CROP_NPP, x: productivity }), floodShare)
}

function compute({
	provinces,
	landGraph,
	mesh,
	planetRadiusKm,
	temperatureMonthly,
	rainfallMonthly,
	petMonthly,
	elevationKm,
	gdd,
	topography,
	vegetation,
	riverVisible,
}: MeasuresParams): ProvinceMeasures {
	const count = provinces.count
	const N = mesh.numRegions
	const regionArea = UNITS.regionAreasKm2({ mesh, planetRadiusKm })
	const areaKm2 = new Float64Array(count)
	const temp = new Float64Array(count * MONTHS)
	const rain = new Float64Array(count * MONTHS)
	const pet = new Float64Array(count * MONTHS)
	const elevation = new Float64Array(count)
	const gddMean = new Float64Array(count)
	const grass = new Float64Array(count)
	const flood = new Float64Array(count)
	for (let r = 0; r < N; r++) {
		const p = provinces.regionProvince[r]
		if (p < 0) continue
		const a = regionArea[r]
		areaKm2[p] += a
		elevation[p] += a * elevationKm[r]
		gddMean[p] += a * gdd[r]
		for (let m = 0; m < MONTHS; m++) {
			temp[p * MONTHS + m] += a * temperatureMonthly[m * N + r]
			rain[p * MONTHS + m] += a * rainfallMonthly[m * N + r]
			pet[p * MONTHS + m] += a * petMonthly[m * N + r]
		}
		grass[p] += (PASTURE_CREDIT[vegetation[r]] ?? 0) * a
		if (riverVisible[r] && topography[r] === CLASSIFICATION.topoFlat)
			flood[p] += a
	}
	const out: ProvinceMeasures = {
		count,
		areaKm2,
		T: new Float64Array(count),
		P: new Float64Array(count),
		arid: new Float64Array(count),
		seas: new Float64Array(count),
		range: new Float64Array(count),
		Tc: new Float64Array(count),
		relief: new Float64Array(count),
		npp: new Float64Array(count),
		gdd: gddMean,
		forager: new Float64Array(count),
		floodShare: new Float64Array(count),
		pasture: new Float64Array(count),
	}
	for (let p = 0; p < count; p++) {
		const a = Math.max(1e-9, areaKm2[p])
		elevation[p] /= a
		gddMean[p] /= a
		const offset = p * MONTHS
		let T = 0
		let P = 0
		let PET = 0
		let Tw = -Infinity
		let Tc = Infinity
		for (let m = 0; m < MONTHS; m++) {
			temp[offset + m] /= a
			rain[offset + m] /= a
			pet[offset + m] /= a
			T += temp[offset + m] / MONTHS
			P += rain[offset + m]
			PET += pet[offset + m]
			Tw = Math.max(Tw, temp[offset + m])
			Tc = Math.min(Tc, temp[offset + m])
		}
		let walsh = 0
		for (let m = 0; m < MONTHS; m++)
			walsh += Math.abs(rain[offset + m] - P / MONTHS)
		out.T[p] = T
		out.P[p] = P
		out.arid[p] = PET > 0 ? P / PET : P > 0 ? Infinity : 0
		out.seas[p] = P > 0 ? walsh / P : 0
		out.range[p] = Tw - Tc
		out.Tc[p] = Tc
		out.npp[p] = npp({ T, P })
		const aquatic = provinces.riverAccess[p] || provinces.waterAccess[p] === 2
		const base =
			FORAGER_FLOOR +
			FORAGER_SPAN * MATH.smoothstep({ ...FORAGER_NPP, x: out.npp[p] })
		out.forager[p] = aquatic ? base * AQUATIC : base
		out.floodShare[p] = flood[p] / a
		out.pasture[p] = grass[p] / a
	}
	for (let p = 0; p < count; p++) {
		let low = elevation[p]
		let high = elevation[p]
		for (let j = landGraph.adjOffset[p]; j < landGraph.adjOffset[p + 1]; j++) {
			const q = landGraph.adjList[j]
			low = Math.min(low, elevation[q])
			high = Math.max(high, elevation[q])
		}
		out.relief[p] = high - low
	}
	return out
}

export const FARMING_MEASURES = { compute, season, moisture }
