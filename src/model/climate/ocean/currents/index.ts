import type {
	ApplySSTToClimateParams,
	BuildOceanCurrentGridParams,
	ComputeSSTParams,
	ObservedOceanCurrentGridParams,
} from "@/model/climate/ocean/currents/types"
import { RAIN } from "@/model/climate/precipitation/rain"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import { WIND } from "@/model/climate/weather/wind"
import type { FlowGrid } from "@/model/climate/weather/wind/types"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import type { SphereMesh } from "@/model/mesh/types"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"

const CURRENT_EFFECT_MONTHS = 12

// SST anomaly (°C vs zonal mean) at which the observed (NOAA) overlay's
// warm/cold color scale saturates to ±1 -- tuned to the magnitude of real
// western-boundary currents like the Gulf Stream/Kuroshio.
const SST_ANOMALY_SATURATION_C = 4

// Separate saturation constant for the modeled bandC table below: bandC's
// own peak values intentionally exceed real SST-anomaly magnitudes, so
// reusing SST_ANOMALY_SATURATION_C here would clamp the strongest bands to
// ±1 in every month of the year -- a value permanently pinned at its ceiling
// has zero headroom left for the ITCZ's monthly drift to move it, which
// flattens out the very seasonal signal that drift is supposed to provide.
// Sized against bandC's own max (see CURRENT_STRENGTH_SCALE below).
const MODELED_SST_SATURATION_C = 9

// bandC's raw table values (below) were originally fit small enough that,
// even combined with LAND_CURRENT_EFFECT_SCALE at its own ceiling, coastal
// regions whose real climate is dominated by a strong western-boundary
// current (e.g. Scotland/Norway under the North Atlantic Current's real
// influence) came out with an ANNUAL-MEAN cold bias of several degrees --
// verified directly against WorldClim (Norway ~4.8C short, Scotland ~4.9C
// short). This scales the whole table up to close most of that gap.
// Deliberately NOT scaled all the way to fully closing it (a ~2.2x scale
// closed the annual mean almost exactly but pushed summer months into a
// 2-3C overshoot and cost ~6.5% on the global land RMSE vs WorldClim,
// since the real current's warming effect is winter-weighted -- ocean
// thermal inertia matters most when land would otherwise radiate away heat
// fast in low-sun winter, not in summer when direct insolation already
// dominates -- and this uniform per-month scale can't reproduce that
// asymmetry, only shift the whole seasonal curve up equally). 1.5x was
// chosen as the point past which further scale bought rapidly diminishing
// annual-mean improvement at rapidly increasing summer-overshoot cost; a
// winter-weighted seasonal profile (rather than a flat scale) would be the
// real fix if this needs to close further -- see
// earth-real-temperature-compare.smoke.test.ts for the global regression
// check (RMSE 4.49 -> 4.56, ~1.6%, at this value).
const CURRENT_STRENGTH_SCALE = 1.5

// West-facing coast SST anomaly by distance from the (monthly) ITCZ, °C --
// cold eastern-boundary upwelling close to the ITCZ (Peru/Benguela/
// California), warming into the subpolar westerlies further away. Indexed
// by ITCZ distance rather than absolute latitude so the whole curve -- not
// just a separate wobble on top of it -- migrates with the ITCZ's monthly
// drift; that drift is the sole source of seasonality, there's no separate
// per-month table or scaling term.
const WEST_BAND_C_TABLE = [-0.5, -1, -5, -2.5, 1, 4, 5, 6, 2, 0].map(
	(v) => v * CURRENT_STRENGTH_SCALE,
)
const westBandC = (dist: number) =>
	MATH.piecewise({
		domain: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
		range: WEST_BAND_C_TABLE,
		x: dist,
	})

// East-facing coast SST anomaly by distance from the (monthly) ITCZ, °C --
// warm western-boundary currents (Gulf Stream/Kuroshio/Agulhas) close to the
// ITCZ, cooling into the subpolar gyres further away.
const EAST_BAND_C_TABLE = [0.2, 1, 2, 3, -2, -5, -3, -1.5, 0, 0].map(
	(v) => v * CURRENT_STRENGTH_SCALE,
)
const eastBandC = (dist: number) =>
	MATH.piecewise({
		domain: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
		range: EAST_BAND_C_TABLE,
		x: dist,
	})

const bandC = (dist: number, coastSide: number): number =>
	coastSide < 0 ? westBandC(dist) : coastSide > 0 ? eastBandC(dist) : 0

// Coast-hugging falloff -- currents/upwelling are a coastal phenomenon, not
// a whole-basin gyre, so the signal fades to nothing by ~800km offshore.
const COAST_DECAY_KM = 800

const coastDecay = (distCoastKm: number) =>
	1 - MATH.smoothstep({ edge0: 0, edge1: COAST_DECAY_KM, x: distCoastKm })

const LANDMARK_TYPE_CONTINENT = 0

/** For every ocean cell within range of a coastline, the east/west facing of
 * the nearest continental coast (+1 east-facing, -1 west-facing). Facing is
 * read from RAIN's own east/west moisture-advection split (eastAdv vs
 * westAdv) sampled at the adjacent LAND cell -- that split is only
 * meaningfully differentiated on land (it's tied by construction at ocean
 * source cells, see computeAdvection's seeding step), so it must be read
 * there and then propagated outward into the ocean, not read at the ocean
 * cell itself. */
function computeCoastSide({
	mesh,
	isLand,
	isLake,
	landmarks,
	eastAdv,
	westAdv,
	avgEdgeKm,
}: {
	mesh: SphereMesh
	isLand: Uint8Array
	isLake: Uint8Array
	landmarks: ComputeSSTParams["landmarks"]
	eastAdv: Float32Array
	westAdv: Float32Array
	avgEdgeKm: number
}): Int8Array {
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

/** Cosmetic-only fade of an ocean-cell field onto adjacent land, purely for
 * visual continuity at the coastline in the map overlay/hover -- does not
 * feed back into anything. */
function bleedOntoLand({
	mesh,
	isLand,
	isLake,
	oceanValue,
	avgEdgeKm,
}: {
	mesh: SphereMesh
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

/** Purely a display quantity: two inputs (a coast-facing band indexed by
 * distance from the (monthly) ITCZ, and distance from coast) -- no
 * temperature field involved, and the result never feeds back into
 * climate.temperature. The band is indexed by ITCZ distance rather than
 * absolute latitude, so the whole curve migrates with the ITCZ's monthly
 * drift -- that migration is the only source of seasonality here, there's
 * no separate per-month table or scaling term. Coast-facing reuses RAIN's
 * own east/west moisture-advection split
 * (eastAdv/westAdv -- which channel of wind-driven transport dominates a
 * cell) rather than a separately-derived geographic bearing, since that
 * split already correctly tracks each planet's own Hadley width/rotation
 * rate instead of hardcoded degree breakpoints -- see computeCoastSide for
 * why it's sampled on land and propagated outward, not read at the ocean
 * cell directly. Land cells get a cosmetic fade of the nearest ocean value
 * so the coastline reads continuously in the overlay/hover; that fade
 * carries no signal of its own. */
function computeSST({
	mesh,
	isLand,
	distCoast,
	landmarks,
	monthlyTEQ,
	eastAdv,
	westAdv,
	planetRadiusKm,
}: ComputeSSTParams): GenesisOceanCurrents {
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
		const decay = coastDecay(distCoast[r])
		if (decay <= 0) continue
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const teq = monthlyTEQ[month][regionBin[r]]
			const dist = Math.abs(latDeg[r] - teq)
			const anomalyC = bandC(dist, side) * decay
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
// not a separately-modeled inland transport -- was 0.68 (bleed weaker than
// the water's own effect), raised to 1 (full bleed-through, matched to open
// water) as part of closing the UK/Norway-style annual-mean cold bias (see
// CURRENT_STRENGTH_SCALE) -- 1 is the physically-defensible ceiling for this
// constant (land literally receiving MORE than the adjacent water's own
// current strength would have no physical basis), so the remaining gap after
// maxing this out came from CURRENT_STRENGTH_SCALE instead.
const LAND_CURRENT_EFFECT_SCALE = 1

/** Applies a previously computed SST field to climate.temperature_avg/min/
 * max/monthly. Kept as a separate step from computeSST (rather than folded
 * in) so it can be re-run each time the pipeline recomputes climate from
 * scratch later on (draining closed water, finalizing landmarks) without
 * recomputing the SST field itself, which only depends on geometry/coast
 * facing/ITCZ position established earlier in the pipeline. */
function applySSTToClimate({
	mesh,
	climate,
	isLand,
	oceanCurrents,
}: ApplySSTToClimateParams): void {
	return
	// temperature_min/max are deliberately left untouched here -- they get
	// fully recomputed later by CLIMATE.applyDtrToClimateMinMax straight from
	// temperature_monthly (which this function mutates in place), so they'll
	// correctly reflect this delta once that runs. Combining a separately
	// tracked delta min/max into them here would be wrong regardless: the
	// month with the coldest delta isn't necessarily the month that's
	// actually this region's coldest.
	const N = mesh.numRegions
	for (let r = 0; r < N; r++) {
		const landScale = isLand[r] ? LAND_CURRENT_EFFECT_SCALE : 1
		let annualSum = 0
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const delta =
				oceanCurrents.sstMonthly[month * N + r] *
				MODELED_SST_SATURATION_C *
				landScale
			const updated = climate.temperature_monthly[month * N + r] + delta
			climate.temperature_monthly[month * N + r] = updated
			annualSum += updated
		}
		climate.temperature_avg[r] = annualSum / CURRENT_EFFECT_MONTHS
	}
}

const OCEAN_CURRENT_SMOOTHING_PASSES = 2

/** Derives a flow-direction FlowGrid from the spatial gradient of an SST
 * field (warm-to-cold implies a boundary current), rotated by hemisphere to
 * approximate geostrophic turning, and restricted to a coastal display band.
 * Purely a visualization -- the direction isn't otherwise tracked. */
function buildOceanCurrentGrid({
	mesh,
	sst,
	isLand,
	latDeg,
	lonDeg,
	reverseCirculation = false,
	planetRadiusKm,
}: BuildOceanCurrentGridParams): FlowGrid {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
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
		const hemisphereTurn =
			(latDeg[r] >= 0 ? 1 : -1) * (reverseCirculation ? -1 : 1)
		const u = srcY[r] * hemisphereTurn
		const v = -srcX[r] * hemisphereTurn
		const speed = Math.hypot(u, v)
		currentU[r] = u
		currentV[r] = v
		currentSpeed[r] = speed
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

/** Builds the same FlowGrid shape as buildOceanCurrentGrid (u/v direction,
 * speed, and a -1..+1 warm/cold scalar for oceanCurrentColor) but sourced
 * from GenesisWorld.observedCurrent (GODAS surface current + OISST SST
 * anomaly, sampled onto mesh regions by attachObservedEarthCurrent) instead
 * of the modeled SST field -- lets the ocean current particle overlay render
 * real Earth currents for comparison against the model (see the "Ocean
 * Currents" -> "Observed (NOAA)" toggle in OverlayControls). */
function observedOceanCurrentGridForMonth({
	mesh,
	isLand,
	observedCurrent,
	month,
}: ObservedOceanCurrentGridParams): FlowGrid {
	const N = mesh.numRegions
	const currentU = new Float32Array(N)
	const currentV = new Float32Array(N)
	const currentSpeed = new Float32Array(N)
	const warmth = new Float32Array(N)

	const realU = observedCurrent?.real_u_monthly
	const realV = observedCurrent?.real_v_monthly
	const realSst = observedCurrent?.real_sst_anomaly_monthly
	if (realU && realV) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) continue
			let u: number
			let v: number
			if (month !== undefined && month >= 0 && month < 12) {
				u = realU[month * N + r]
				v = realV[month * N + r]
			} else {
				let uSum = 0
				let vSum = 0
				let count = 0
				for (let m = 0; m < 12; m++) {
					const uu = realU[m * N + r]
					const vv = realV[m * N + r]
					if (Number.isFinite(uu) && Number.isFinite(vv)) {
						uSum += uu
						vSum += vv
						count++
					}
				}
				u = count > 0 ? uSum / count : NaN
				v = count > 0 ? vSum / count : NaN
			}
			if (!Number.isFinite(u) || !Number.isFinite(v)) continue
			currentU[r] = u
			currentV[r] = v
			currentSpeed[r] = Math.hypot(u, v)
		}
	}
	if (realSst) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) continue
			let sst: number
			if (month !== undefined && month >= 0 && month < 12) {
				sst = realSst[month * N + r]
			} else {
				let sum = 0
				let count = 0
				for (let m = 0; m < 12; m++) {
					const v = realSst[m * N + r]
					if (Number.isFinite(v)) {
						sum += v
						count++
					}
				}
				sst = count > 0 ? sum / count : NaN
			}
			if (!Number.isFinite(sst)) continue
			warmth[r] = Math.max(-1, Math.min(1, sst / SST_ANOMALY_SATURATION_C))
		}
	}

	return WIND.rasterizeVectorGrid({
		mesh,
		vectorU: currentU,
		vectorV: currentV,
		vectorSpeed: currentSpeed,
		options: {
			scalar: warmth,
			allowCell: (region) => !isLand[region] && currentSpeed[region] > 0,
			isBlockedRegion: (region) => !!isLand[region],
		},
	})
}

export const OCEAN_CURRENTS = {
	computeSST,
	applySSTToClimate,
	buildOceanCurrentGrid,
	observedOceanCurrentGridForMonth,
	/** °C anomaly that saturates the modeled (bandC-derived), normalized
	 * -1..+1 sst field to ±1 -- use to convert a stored sst value back to an
	 * approximate °C reading (exact except where the source anomaly was
	 * itself clamped at saturation). Not the same constant the observed
	 * (NOAA) overlay saturates at -- see MODELED_SST_SATURATION_C. */
	sstAnomalySaturationC: MODELED_SST_SATURATION_C,
}
