import { COASTAL_BLEED } from "@/model/climate/ocean/coastal-bleed"
import type {
	CoastSideParams,
	HeuristicCurrentParams,
} from "@/model/climate/ocean/currents/heuristic/types"
import { SURFACE_FLOW } from "@/model/climate/ocean/surface-flow"
import { RAIN } from "@/model/climate/precipitation/rain"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"

const MONTHS = 12
const COAST_DECAY_KM = 800
const SST_SATURATION_C = 9
const CURRENT_STRENGTH_SCALE = 1.5
const BAND_DOMAIN = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
const WEST_BAND_C_TABLE = [-0.5, -1, -5, -2.5, 1, 4, 5, 6, 2, 0].map(
	(value) => value * CURRENT_STRENGTH_SCALE,
)
const EAST_BAND_C_TABLE = [0.2, 1, 2, 3, -2, -5, -3, -1.5, 0, 0].map(
	(value) => value * CURRENT_STRENGTH_SCALE,
)

function computeCoastSide({
	mesh,
	isLand,
	isLake,
	isContinent,
	eastAdv,
	westAdv,
	avgEdgeKm,
}: CoastSideParams): Int8Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const coastSide = new Int8Array(N)
	const dist = new Int32Array(N).fill(-1)
	const queue = new Int32Array(N)
	let head = 0
	let tail = 0

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		if (!isContinent[r]) continue
		const side = eastAdv[r] > westAdv[r] ? 1 : -1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] || isLake[nb] || dist[nb] >= 0) continue
			coastSide[nb] = side
			dist[nb] = 0
			queue[tail++] = nb
		}
	}

	const maxHops = Math.max(1, Math.round(COAST_DECAY_KM / avgEdgeKm))
	while (head < tail) {
		const r = queue[head++]
		if (dist[r] >= maxHops) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] || isLake[nb] || dist[nb] >= 0) continue
			dist[nb] = dist[r] + 1
			coastSide[nb] = coastSide[r]
			queue[tail++] = nb
		}
	}
	return coastSide
}

function computeCurrents({
	mesh,
	isLand,
	distCoast,
	landmarks,
	monthlyTEQ,
	eastAdv,
	westAdv,
	planetRadiusKm,
}: HeuristicCurrentParams): GenesisOceanCurrents {
	const N = mesh.numRegions
	const avgEdgeKm = UNITS.meanEdgeLengthKm({ mesh, planetRadiusKm })
	const isLake = LANDMARKS.regionTypeMask({ landmarks, type: "lake" })
	const isContinent = LANDMARKS.regionTypeMask({ landmarks, type: "continent" })
	const coastSide = computeCoastSide({
		mesh,
		isLand,
		isLake,
		isContinent,
		eastAdv,
		westAdv,
		avgEdgeKm,
	})
	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)
	const sstMonthly = new Float32Array(N * MONTHS)
	const sst = new Float32Array(N)
	const fSign = new Int8Array(N)

	for (let r = 0; r < N; r++) {
		fSign[r] = latDeg[r] >= 0 ? -1 : 1
		if (isLand[r] || isLake[r] || coastSide[r] === 0) continue
		const decay =
			1 -
			MATH.smoothstep({
				edge0: 0,
				edge1: COAST_DECAY_KM,
				x: distCoast[r],
			})
		if (decay <= 0) continue
		const range = coastSide[r] < 0 ? WEST_BAND_C_TABLE : EAST_BAND_C_TABLE
		for (let month = 0; month < MONTHS; month++) {
			const distance = Math.abs(latDeg[r] - monthlyTEQ[month][regionBin[r]])
			const anomalyC =
				MATH.piecewise({
					domain: BAND_DOMAIN,
					range,
					x: distance,
				}) * decay
			const value = MATH.clamp({
				value: anomalyC / SST_SATURATION_C,
				lo: -1,
				hi: 1,
			})
			sstMonthly[month * N + r] = value
			sst[r] += value / MONTHS
		}
	}

	COASTAL_BLEED.fillLand({ mesh, isLand, isLake, avgEdgeKm, sst, sstMonthly })
	return {
		sst,
		sstMonthly,
		...SURFACE_FLOW.fromSstFields({ mesh, isLand, fSign, sst, sstMonthly }),
	}
}

export const HEURISTIC_CURRENTS = {
	computeCurrents,
	sstAnomalySaturationC: SST_SATURATION_C,
}
