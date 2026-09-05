import type {
	ApplyLockedSSTToClimateParams,
	BuildLockedOceanCurrentGridParams,
	ComputeLockedSSTParams,
	LockedSSTParams,
} from "@/model/climate/ocean/tidal-locked/types"
import { RAIN } from "@/model/climate/precipitation/rain"
import { HEAT } from "@/model/climate/temperature/tidal-locked"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import { WIND } from "@/model/climate/weather/wind"
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

const coastDecay = (distCoastKm: number) =>
	1 - MATH.smoothstep({ edge0: 0, edge1: COAST_DECAY_KM, x: distCoastKm })

const OCEAN_CURRENT_SMOOTHING_PASSES = 2

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

/** Cosmetic-only fade of an ocean-cell field onto adjacent land, purely for
 * visual continuity at the coastline in the map overlay/hover -- does not
 * feed back into anything. Identical to ocean/currents/index.ts's helper of
 * the same name -- kept local rather than shared since it's the only thing
 * these two otherwise-unrelated models (rotating vs. tidally locked) have in
 * common. */
function bleedOntoLand({
	mesh,
	isLand,
	isLake,
	oceanValue,
	avgEdgeKm,
}: {
	mesh: ComputeLockedSSTParams["mesh"]
	isLand: Uint8Array
	isLake: Uint8Array
	oceanValue: Float32Array
	avgEdgeKm: number
}): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const bleed = new Float32Array(N)
	const landFadeHops = Math.max(4, Math.round(600 / avgEdgeKm))
	const dist = new Int32Array(N).fill(-1)
	const queue = new Int32Array(N)
	let head = 0
	let tail = 0

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let sum = 0
		let count = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && !isLake[nb]) {
				sum += oceanValue[nb]
				count++
			}
		}
		if (count === 0) continue
		bleed[r] = sum / count
		dist[r] = 0
		queue[tail++] = r
	}

	while (head < tail) {
		const r = queue[head++]
		const d = dist[r] + 1
		if (d >= landFadeHops) continue
		const fade = 1 - d / landFadeHops
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] && dist[nb] === -1) {
				dist[nb] = d
				bleed[nb] = bleed[r] * fade
				queue[tail++] = nb
			}
		}
	}

	return bleed
}

/** Purely a display quantity: two inputs (a substellar-facing band indexed
 * by angular distance from the (monthly) substellar point, and distance
 * from coast) -- no temperature field involved, and the result never feeds
 * back into climate.temperature. There's no east/west coast-facing concept
 * here (unlike the rotating model): a tidally locked ocean's SST pattern is
 * radially symmetric around the substellar point, not organized by
 * rotation-driven wind belts. Land cells get a cosmetic fade of the nearest
 * ocean value so the coastline reads continuously in the overlay/hover;
 * that fade carries no signal of its own. */
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
	const isLake = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		const landmark = landmarks.regionLandmark[r]
		if (landmark < 0 || isLand[r]) continue
		if (landmarks.type[landmark] === LANDMARKS.landmarkTypeLake) isLake[r] = 1
	}

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

	const landBleed = bleedOntoLand({
		mesh,
		isLand,
		isLake,
		oceanValue: sst,
		avgEdgeKm,
	})
	for (let r = 0; r < N; r++) if (isLand[r]) sst[r] = landBleed[r]

	for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
		const monthOcean = sstMonthly.subarray(month * N, (month + 1) * N)
		const monthBleed = bleedOntoLand({
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

// Land cells only get the cosmetic coastal bleed of the nearest ocean sst,
// not the current's full open-water strength, so their applied delta is
// scaled down -- coastal moderation reaches inland, but weaker than what
// the water itself experiences. Same value/rationale as the rotating
// model's LAND_CURRENT_EFFECT_SCALE.
const LAND_CURRENT_EFFECT_SCALE = 0.68

/** Applies a previously computed locked SST field to climate.temperature_
 * avg/monthly (temperature_min/max are deliberately left untouched -- they
 * get fully recomputed later by CLIMATE.applyDtrToClimateMinMax straight
 * from temperature_monthly, which this function mutates in place). Kept as
 * a separate step from computeLockedSST so it can be re-run each time the
 * pipeline recomputes climate from scratch later on, without recomputing
 * the SST field itself. */
function applyLockedSSTToClimate({
	mesh,
	climate,
	isLand,
	oceanCurrents,
}: ApplyLockedSSTToClimateParams): void {
	const N = mesh.numRegions
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let annualSum = 0
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const delta =
				oceanCurrents.sstMonthly[month * N + r] *
				MODELED_SST_SATURATION_C *
				LAND_CURRENT_EFFECT_SCALE
			const updated = climate.temperature_monthly[month * N + r] + delta
			climate.temperature_monthly[month * N + r] = updated
			annualSum += updated
		}
		climate.temperature_avg[r] = annualSum / CURRENT_EFFECT_MONTHS
	}
}

/** Derives a flow-direction FlowGrid from the spatial gradient of the locked
 * SST field (warm dayside to cold nightside implies a surface current),
 * restricted to a coastal display band. Unlike the rotating model's
 * buildOceanCurrentGrid, there's no hemisphere-based Coriolis turn applied
 * -- a tidally locked planet's day/night thermal circulation isn't
 * organized into rotation-driven gyres the same way, so the raw gradient
 * direction is used as-is. Purely a visualization -- the direction isn't
 * otherwise tracked. */
function buildLockedOceanCurrentGrid({
	mesh,
	sst,
	isLand,
	planetRadiusKm,
}: BuildLockedOceanCurrentGridParams): FlowGrid {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const { latDeg, lonDeg } = RAIN.getClimateGeometry(mesh)
	const gradX = new Float32Array(N)
	const gradY = new Float32Array(N)
	const smoothedX = new Float32Array(N)
	const smoothedY = new Float32Array(N)
	const currentU = new Float32Array(N)
	const currentV = new Float32Array(N)
	const currentSpeed = new Float32Array(N)

	const wrapLonDeltaDeg = (delta: number): number => {
		if (delta > 180) return delta - 360
		if (delta < -180) return delta + 360
		return delta
	}

	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		let gx = 0
		let gy = 0
		let weightSum = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			const dx =
				wrapLonDeltaDeg(lonDeg[nb] - lonDeg[r]) *
				Math.cos((((latDeg[r] + latDeg[nb]) * 0.5) / 180) * Math.PI)
			const dy = latDeg[nb] - latDeg[r]
			const distSq = dx * dx + dy * dy
			if (distSq <= 1e-6) continue
			const neighbourSst = isLand[nb] ? 0 : sst[nb]
			const dw = neighbourSst - sst[r]
			gx += (dw * dx) / distSq
			gy += (dw * dy) / distSq
			weightSum += 1
		}
		if (weightSum > 0) {
			gradX[r] = gx / weightSum
			gradY[r] = gy / weightSum
		}
	}

	let srcX = gradX
	let srcY = gradY
	let dstX = smoothedX
	let dstY = smoothedY
	for (let pass = 0; pass < OCEAN_CURRENT_SMOOTHING_PASSES; pass++) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) {
				dstX[r] = 0
				dstY[r] = 0
				continue
			}
			let sumX = srcX[r]
			let sumY = srcY[r]
			let count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb]) continue
				sumX += srcX[nb]
				sumY += srcY[nb]
				count++
			}
			dstX[r] = sumX / count
			dstY[r] = sumY / count
		}
		;[srcX, dstX] = [dstX, srcX]
		;[srcY, dstY] = [dstY, srcY]
	}

	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		const u = srcY[r]
		const v = -srcX[r]
		currentU[r] = u
		currentV[r] = v
		currentSpeed[r] = Math.hypot(u, v)
	}

	// BFS from land to find ocean cells within the coastal display band.
	const maxCoastHops = Math.round(
		600 / UNITS.meanEdgeLengthKm({ mesh, planetRadiusKm }),
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

	return WIND.rasterizeVectorGrid({
		mesh,
		vectorU: currentU,
		vectorV: currentV,
		vectorSpeed: currentSpeed,
		options: {
			scalar: sst,
			allowCell: (region) => !isLand[region] && coastalOcean[region] === 1,
			isBlockedRegion: (region) => !!isLand[region],
		},
	})
}

export const OCEAN_CURRENTS = {
	computeLockedSST,
	applyLockedSSTToClimate,
	buildLockedOceanCurrentGrid,
}
