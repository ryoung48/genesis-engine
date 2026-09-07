import { COASTAL_BLEED } from "@/model/climate/ocean/coastal-bleed"
import { OCEAN_CURRENT_DISPLAY } from "@/model/climate/ocean/currents/display"
import type {
	BuildOceanCurrentGridParams,
	ObservedOceanCurrentGridParams,
} from "@/model/climate/ocean/currents/display/types"
import type {
	ApplySSTToClimateParams,
	CoastInfluence,
	CoastInfluenceInput,
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

const COAST_DECAY_KM = 800

// Where an east-coast and a west-coast boundary-current regime reach the same
// water with comparable strength (a confluence, e.g. Gulf Stream vs Labrador),
// their opposed anomalies are averaged, then scaled down by up to this fraction
// as the two influences approach parity.
const CONFLUENCE_DAMPING = 0.6

const LANDMARK_TYPE_CONTINENT = 0

// One weighted multi-source flood per regime: seed every continental coast cell
// that faces that regime at weight 1, then ramp linearly to 0 over COAST_DECAY_KM
// of ocean. Nearest coast wins a cell's weight (FIFO order settles it). Unlike
// the old winner-take-all sign, both regimes can reach the same water, which is
// what lets computeRotatingSST blend and damp opposed currents where they meet.
function computeCoastInfluence({
	mesh,
	isLand,
	isLake,
	landmarks,
	eastAdv,
	westAdv,
	avgEdgeKm,
}: CoastInfluenceInput): CoastInfluence {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const maxHops = Math.max(1, Math.round(COAST_DECAY_KM / avgEdgeKm))
	const queue = new Int32Array(N)

	const floodFromCoasts = (regime: 1 | -1): Float32Array => {
		const influence = new Float32Array(N)
		const hop = new Int32Array(N).fill(-1)
		let head = 0
		let tail = 0

		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			const landmark = landmarks.regionLandmark[r]
			if (landmark < 0 || landmarks.type[landmark] !== LANDMARK_TYPE_CONTINENT)
				continue
			if ((eastAdv[r] > westAdv[r] ? 1 : -1) !== regime) continue
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb] || isLake[nb] || hop[nb] >= 0) continue
				hop[nb] = 0
				influence[nb] = 1
				queue[tail++] = nb
			}
		}

		while (head < tail) {
			const r = queue[head++]
			if (hop[r] >= maxHops) continue
			const nextHop = hop[r] + 1
			const weight = 1 - nextHop / maxHops
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb] || isLake[nb] || hop[nb] >= 0) continue
				hop[nb] = nextHop
				influence[nb] = weight
				queue[tail++] = nb
			}
		}

		return influence
	}

	return { east: floodFromCoasts(1), west: floodFromCoasts(-1) }
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

	const coastInfluence = computeCoastInfluence({
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
		const westReach = coastInfluence.west[r]
		const eastReach = coastInfluence.east[r]
		const maxReach = Math.max(westReach, eastReach)
		if (maxReach <= 1e-3) continue
		const decay = COASTAL_BLEED.decay(distCoast[r])
		if (decay <= 0) continue
		const totalReach = westReach + eastReach
		const minReach = Math.min(westReach, eastReach)
		// A confluence is near-shore of BOTH regimes at once: minReach is high
		// only when the farther of the two coasts is still close. Elsewhere a
		// cell takes its dominant regime's band unchanged — a current wrapping a
		// continental tip into the other regime's far field does not blend.
		const blendMix = MATH.smoothstep({ edge0: 0.62, edge1: 0.82, x: minReach })
		// Within that confluence, averaging the opposed bands already softens
		// the anomaly; this pulls it down further as the two reaches near parity.
		const opposition = minReach / maxReach
		const confluenceScale =
			1 -
			CONFLUENCE_DAMPING *
				MATH.smoothstep({ edge0: 0.4, edge1: 0.9, x: opposition })
		const dominantBand = westReach >= eastReach ? westBandC : eastBandC
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const teq = monthlyTEQ[month][regionBin[r]]
			const dist = Math.abs(latDeg[r] - teq)
			const confluenceC =
				((westReach * westBandC(dist) + eastReach * eastBandC(dist)) /
					totalReach) *
				confluenceScale
			const anomalyC =
				(dominantBand(dist) * (1 - blendMix) + confluenceC * blendMix) * decay
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
	oceanCurrents,
	isLocked,
}: ApplySSTToClimateParams): void {
	const N = mesh.numRegions
	const anomalyScaleC = isLocked ? 6 * 0.68 : MODELED_SST_SATURATION_C
	for (let r = 0; r < N; r++) {
		let annualSum = 0
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const updated =
				climate.temperature_monthly[month * N + r] +
				oceanCurrents.sstMonthly[month * N + r] * anomalyScaleC
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
