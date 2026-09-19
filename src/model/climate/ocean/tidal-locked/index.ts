import { COASTAL_BLEED } from "@/model/climate/ocean/coastal-bleed"
import { SURFACE_FLOW } from "@/model/climate/ocean/surface-flow"
import type {
	ApplyLockedSSTToClimateParams,
	BuildLockedOceanCurrentGridParams,
	ComputeLockedSSTParams,
	LockedSSTParams,
} from "@/model/climate/ocean/tidal-locked/types"
import { TEMPERATURE_SHARED } from "@/model/climate/shared/temperature"
import { HEAT } from "@/model/climate/temperature/tidal-locked"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import type { FlowGrid } from "@/model/climate/weather/wind/types"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"

const CURRENT_EFFECT_MONTHS = 12

const RAD2DEG = 180 / Math.PI

// SST anomaly by angular distance from the (monthly) substellar point, °C --
// warm dayside, cooling through the terminator, cold nightside. Indexed by
// substellar distance rather than a fixed angle so the whole curve migrates
// with the star's monthly libration/declination drift -- that drift (from
// orbital eccentricity/obliquity) is the sole source of seasonality here,
// mirroring how the rotating-planet model is indexed by ITCZ distance
// instead of absolute latitude (see ocean/currents/index.ts).
const substellarBandC = (distDeg: number) =>
	MATH.piecewise({
		domain: [0, 30, 60, 90, 120, 150, 180],
		range: [6, 4, 1, -1, -3, -4, -4],
		x: distDeg,
	})

// bandC's own peak (6, at the substellar point) sets its own saturation
// ceiling -- see ocean/currents/index.ts's MODELED_SST_SATURATION_C for why
// this must be sized off the table's own max rather than reusing the
// observed-data constant.
const MODELED_SST_SATURATION_C = 6

// Coast-hugging falloff -- currents/upwelling are a coastal phenomenon, not
// a whole-basin gyre, so the signal fades to nothing by ~800km offshore.
const COAST_DECAY_KM = 800

const COASTAL_DISPLAY_KM = 600

const coastDecay = (distCoastKm: number) =>
	1 - MATH.smoothstep({ edge0: 0, edge1: COAST_DECAY_KM, x: distCoastKm })

function computeMonthlySubstellarDirections(
	params?: LockedSSTParams,
): Array<[number, number, number]> {
	const substellarLon = params?.substellarLon ?? UNITS.defaultSubstellarLon
	const obliquity = params?.obliquity ?? 0
	const eccentricity = params?.eccentricity ?? 0
	const perihelion = params?.perihelion ?? 102
	const monthlyLibration = HEAT.computeMonthlyLibration({
		eccentricity,
		perihelion,
	})
	const monthlyDeclination = HEAT.computeMonthlyLockedDeclination({
		obliquity,
		eccentricity,
		perihelion,
	})
	const directions: Array<[number, number, number]> = []
	for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++)
		directions.push(
			HEAT.getSubstellarDirWithOffsetAndDeclination({
				substellarLon,
				lonOffsetRad: monthlyLibration[month],
				declinationRad: monthlyDeclination[month],
			}),
		)
	return directions
}

// A tidally locked ocean's SST pattern is radially symmetric around the
// substellar point rather than organized by rotation-driven wind belts, so
// there's no coast-facing term here.
function computeLockedSST({
	mesh,
	isLand,
	distCoast,
	landmarks,
	params,
}: ComputeLockedSSTParams): GenesisOceanCurrents {
	const N = mesh.numRegions
	const avgEdgeKm = UNITS.meanEdgeLengthKm({
		mesh,
		planetRadiusKm: params?.planetRadiusKm,
	})
	const isLake = LANDMARKS.regionTypeMask({ landmarks, type: "lake" })

	const monthlyDirs = computeMonthlySubstellarDirections(params)
	const r_xyz = mesh.r_xyz

	const sstMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
	const sst = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue
		const decay = coastDecay(distCoast[r])
		if (decay <= 0) continue
		const offset = r * 3
		const x = r_xyz[offset]
		const y = r_xyz[offset + 1]
		const z = r_xyz[offset + 2]
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const dir = monthlyDirs[month]
			const ct = MATH.clamp({
				value: x * dir[0] + y * dir[1] + z * dir[2],
				lo: -1,
				hi: 1,
			})
			const distDeg = Math.acos(ct) * RAD2DEG
			const anomalyC = substellarBandC(distDeg) * decay
			const value = MATH.clamp({
				value: anomalyC / MODELED_SST_SATURATION_C,
				lo: -1,
				hi: 1,
			})
			sstMonthly[month * N + r] = value
			sst[r] += value / CURRENT_EFFECT_MONTHS
		}
	}

	COASTAL_BLEED.fillLand({ mesh, isLand, isLake, avgEdgeKm, sst, sstMonthly })

	// No hemisphere turn on a locked world: the display keeps the same fixed
	// 90-degree rotation of the SST gradient everywhere.
	const fSign = new Int8Array(N).fill(-1)
	return {
		sst,
		sstMonthly,
		...SURFACE_FLOW.fromSstFields({ mesh, isLand, fSign, sst, sstMonthly }),
	}
}

// Land cells only get the cosmetic coastal bleed of the nearest ocean sst,
// not the current's full open-water strength, so their applied delta is
// scaled down -- coastal moderation reaches inland, but weaker than what
// the water itself experiences. Same value/rationale as the rotating
// model's LAND_CURRENT_EFFECT_SCALE.
const LAND_CURRENT_EFFECT_SCALE = 0.68

// temperature_min/max are left untouched: CLIMATE.applyDtrToClimateMinMax
// recomputes them later from temperature_monthly, which this mutates.
function applyLockedSSTToClimate({
	mesh,
	climate,
	isLand,
	oceanCurrents,
}: ApplyLockedSSTToClimateParams): void {
	TEMPERATURE_SHARED.applyOceanSst({
		mesh,
		climate,
		isLand,
		oceanCurrents,
		saturationC: MODELED_SST_SATURATION_C,
		landScale: LAND_CURRENT_EFFECT_SCALE,
	})
}

// The locked SST signal only exists near coasts, so the display is limited
// to a coastal band of ocean.
function buildLockedOceanCurrentGrid({
	mesh,
	isLand,
	oceanCurrents,
	month,
	planetRadiusKm,
}: BuildLockedOceanCurrentGridParams): FlowGrid {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const maxCoastHops = Math.round(
		COASTAL_DISPLAY_KM / UNITS.meanEdgeLengthKm({ mesh, planetRadiusKm }),
	)
	const coastalOcean = new Uint8Array(N)
	const bfsQueue = new Int32Array(N)
	const bfsDist = new Int32Array(N).fill(-1)
	let head = 0
	let tail = 0
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && bfsDist[nb] < 0) {
				bfsDist[nb] = 0
				coastalOcean[nb] = 1
				bfsQueue[tail++] = nb
			}
		}
	}
	while (head < tail) {
		const r = bfsQueue[head++]
		if (bfsDist[r] >= maxCoastHops) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && bfsDist[nb] < 0) {
				bfsDist[nb] = bfsDist[r] + 1
				coastalOcean[nb] = 1
				bfsQueue[tail++] = nb
			}
		}
	}

	return SURFACE_FLOW.toGrid({
		mesh,
		isLand,
		fields: SURFACE_FLOW.forDisplayMonth({
			oceanCurrents,
			numRegions: N,
			month,
		}),
		allowCell: (region) => !isLand[region] && coastalOcean[region] === 1,
	})
}

export const OCEAN_CURRENTS = {
	computeLockedSST,
	applyLockedSSTToClimate,
	buildLockedOceanCurrentGrid,
}
