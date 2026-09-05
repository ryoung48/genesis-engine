import { COASTAL_BLEED } from "@/model/climate/ocean/coastal-bleed"
import { OCEAN_CURRENT_DISPLAY } from "@/model/climate/ocean/currents/display"
import type {
	BuildOceanCurrentGridParams,
	ObservedOceanCurrentGridParams,
} from "@/model/climate/ocean/currents/display/types"
import type {
	ApplySSTToClimateParams,
	BandInput,
	CoastSideInput,
	ComputeSSTParams,
	RotatingSSTParams,
} from "@/model/climate/ocean/currents/types"
import { LOCKED_OCEAN_CURRENTS } from "@/model/climate/ocean/tidal-locked"
import { RAIN } from "@/model/climate/precipitation/rain"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"

const CURRENT_EFFECT_MONTHS = 12

const MODELED_SST_SATURATION_C = 9

const CURRENT_STRENGTH_SCALE = 1.5

const WEST_BAND_C_TABLE = [-0.5, -1, -5, -2.5, 1, 4, 5, 6, 2, 0].map(
	(v) => v * CURRENT_STRENGTH_SCALE,
)
const westBandC = (dist: number) =>
	MATH.piecewise({
		domain: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
		range: WEST_BAND_C_TABLE,
		x: dist,
	})

const EAST_BAND_C_TABLE = [0.2, 1, 2, 3, -2, -5, -3, -1.5, 0, 0].map(
	(v) => v * CURRENT_STRENGTH_SCALE,
)
const eastBandC = (dist: number) =>
	MATH.piecewise({
		domain: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
		range: EAST_BAND_C_TABLE,
		x: dist,
	})

const bandC = ({ dist, coastSide }: BandInput): number =>
	coastSide < 0 ? westBandC(dist) : coastSide > 0 ? eastBandC(dist) : 0

const COAST_DECAY_KM = 800

const LANDMARK_TYPE_CONTINENT = 0

function computeCoastSide({
	mesh,
	isLand,
	isLake,
	landmarks,
	eastAdv,
	westAdv,
	avgEdgeKm,
}: CoastSideInput): Int8Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const coastSide = new Int8Array(N)
	const dist = new Int32Array(N).fill(-1)
	const queue = new Int32Array(N)
	let head = 0
	let tail = 0

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		const landmark = landmarks.regionLandmark[r]
		if (landmark < 0 || landmarks.type[landmark] !== LANDMARK_TYPE_CONTINENT)
			continue
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

function computeRotatingSST({
	mesh,
	isLand,
	distCoast,
	landmarks,
	monthlyTEQ,
	eastAdv,
	westAdv,
	planetRadiusKm,
}: RotatingSSTParams): GenesisOceanCurrents {
	const N = mesh.numRegions
	const avgEdgeKm = UNITS.meanEdgeLengthKm({ mesh, planetRadiusKm })
	const isLake = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		const landmark = landmarks.regionLandmark[r]
		if (landmark < 0 || isLand[r]) continue
		if (landmarks.type[landmark] === LANDMARKS.landmarkTypeLake) isLake[r] = 1
	}

	const coastSide = computeCoastSide({
		mesh,
		isLand,
		isLake,
		landmarks,
		eastAdv,
		westAdv,
		avgEdgeKm,
	})
	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)

	const sstMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
	const sst = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue
		const side = coastSide[r]
		if (side === 0) continue
		const decay = COASTAL_BLEED.decay(distCoast[r])
		if (decay <= 0) continue
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const teq = monthlyTEQ[month][regionBin[r]]
			const dist = Math.abs(latDeg[r] - teq)
			const anomalyC = bandC({ dist, coastSide: side }) * decay
			const value = MATH.clamp({
				value: anomalyC / MODELED_SST_SATURATION_C,
				lo: -1,
				hi: 1,
			})
			sstMonthly[month * N + r] = value
			sst[r] += value / CURRENT_EFFECT_MONTHS
		}
	}

	const landBleed = COASTAL_BLEED.apply({
		mesh,
		isLand,
		isLake,
		oceanValue: sst,
		avgEdgeKm,
	})
	for (let r = 0; r < N; r++) if (isLand[r]) sst[r] = landBleed[r]

	for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
		const monthOcean = sstMonthly.subarray(month * N, (month + 1) * N)
		const monthBleed = COASTAL_BLEED.apply({
			mesh,
			isLand,
			isLake,
			oceanValue: monthOcean,
			avgEdgeKm,
		})
		for (let r = 0; r < N; r++)
			if (isLand[r]) sstMonthly[month * N + r] = monthBleed[r]
	}

	return { sst, sstMonthly }
}

function applySSTToClimate({
	mesh,
	climate,
	isLand,
	oceanCurrents,
	isLocked,
}: ApplySSTToClimateParams): void {
	const N = mesh.numRegions
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let annualSum = 0
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const delta =
				oceanCurrents.sstMonthly[month * N + r] *
				(isLocked ? 6 * 0.68 : MODELED_SST_SATURATION_C)
			const updated = climate.temperature_monthly[month * N + r] + delta
			climate.temperature_monthly[month * N + r] = updated
			annualSum += updated
		}
		climate.temperature_avg[r] = annualSum / CURRENT_EFFECT_MONTHS
	}
}

function computeSST(input: ComputeSSTParams): GenesisOceanCurrents {
	return input.params.tideLock?.type === "solar"
		? LOCKED_OCEAN_CURRENTS.computeLockedSST(input)
		: computeRotatingSST({
				...input,
				planetRadiusKm: input.params.planetRadiusKm,
			})
}

function buildOceanCurrentGrid(input: BuildOceanCurrentGridParams) {
	return OCEAN_CURRENT_DISPLAY.buildOceanCurrentGrid(input)
}

function observedOceanCurrentGridForMonth(
	input: ObservedOceanCurrentGridParams,
) {
	return OCEAN_CURRENT_DISPLAY.observedOceanCurrentGridForMonth(input)
}

export const OCEAN_CURRENTS = {
	computeSST,
	applySSTToClimate,
	buildOceanCurrentGrid,
	observedOceanCurrentGridForMonth,
	sstAnomalySaturationC: MODELED_SST_SATURATION_C,
}
