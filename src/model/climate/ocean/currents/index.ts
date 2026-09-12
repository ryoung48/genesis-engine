import { COASTAL_BLEED } from "@/model/climate/ocean/coastal-bleed"
import { SVERDRUP_CURRENTS } from "@/model/climate/ocean/currents/sverdrup"
import type {
	ApplySSTToClimateParams,
	BuildOceanCurrentGridParams,
	ComputeCoastSideParams,
	ComputeSSTParams,
	ObservedOceanCurrentGridParams,
} from "@/model/climate/ocean/currents/types"
import { SURFACE_FLOW } from "@/model/climate/ocean/surface-flow"
import { RAIN } from "@/model/climate/precipitation/rain"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import { WIND } from "@/model/climate/weather/wind"
import type { FlowGrid } from "@/model/climate/weather/wind/types"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"

const CURRENT_EFFECT_MONTHS = 12

// Which SST model computeSST runs. "sverdrup" derives the surface current
// from a wind-driven Sverdrup/Ekman circulation and the SST anomaly from the
// heat that current carries plus Ekman upwelling (see ./sverdrup). "band" is
// the older coast-facing warm/cold table indexed by distance from the ITCZ,
// with its flow read off the SST gradient.
const CURRENT_SOLVER: "band" | "sverdrup" = "sverdrup"

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

// East/west facing (+1/-1) of the nearest continental coast for ocean cells
// within range of one. Facing is read from RAIN's east/west moisture-advection
// split on the adjacent land cell -- that split is only differentiated on
// land -- and propagated outward into the ocean.
function computeCoastSide({
	mesh,
	isLand,
	isLake,
	isContinent,
	eastAdv,
	westAdv,
	avgEdgeKm,
}: ComputeCoastSideParams): Int8Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const coastSide = new Int8Array(N)
	const dist = new Int32Array(N).fill(-1)
	const queue = new Int32Array(N)
	let head = 0
	let tail = 0

	for (let r = 0; r < N; r++) {
		if (!isLand[r] || !isContinent[r]) continue
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

function computeSST({
	mesh,
	isLand,
	distCoast,
	landmarks,
	monthlyTEQ,
	eastAdv,
	westAdv,
	climate,
	elevation_km,
	params,
	onWindProfile,
}: ComputeSSTParams): GenesisOceanCurrents {
	if (CURRENT_SOLVER === "sverdrup") {
		return SVERDRUP_CURRENTS.computeSST({
			mesh,
			climate,
			elevation_km,
			isLand,
			landmarks,
			sstSaturationC: MODELED_SST_SATURATION_C,
			params,
			onWindProfile,
		})
	}
	const N = mesh.numRegions
	const avgEdgeKm = UNITS.meanEdgeLengthKm({
		mesh,
		planetRadiusKm: params.planetRadiusKm,
	})
	const isLake = LANDMARKS.regionTypeMask({ landmarks, type: "lake" })
	const coastSide = computeCoastSide({
		mesh,
		isLand,
		isLake,
		isContinent: LANDMARKS.regionTypeMask({ landmarks, type: "continent" }),
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

	COASTAL_BLEED.fillLand({ mesh, isLand, isLake, avgEdgeKm, sst, sstMonthly })

	const circulation = UNITS.isRetrogradeObliquity(params.obliquity) ? -1 : 1
	const fSign = new Int8Array(N)
	for (let r = 0; r < N; r++) fSign[r] = (latDeg[r] >= 0 ? 1 : -1) * circulation
	return {
		sst,
		sstMonthly,
		...SURFACE_FLOW.fromSstFields({ mesh, isLand, fSign, sst, sstMonthly }),
	}
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

// Kept separate from computeSST so the pipeline can re-apply the same SST
// field each time it recomputes climate from scratch.
function applySSTToClimate({
	mesh,
	climate,
	isLand,
	oceanCurrents,
}: ApplySSTToClimateParams): void {
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

function buildOceanCurrentGrid({
	mesh,
	isLand,
	oceanCurrents,
	month,
}: BuildOceanCurrentGridParams): FlowGrid {
	return SURFACE_FLOW.toGrid({
		mesh,
		isLand,
		fields: SURFACE_FLOW.forDisplayMonth({
			oceanCurrents,
			numRegions: mesh.numRegions,
			month,
		}),
		allowCell: (region) => !isLand[region],
	})
}

// Same FlowGrid shape as buildOceanCurrentGrid, sourced from the observed
// GODAS surface current and OISST anomaly for comparison against the model.
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
	sstAnomalySaturationC: MODELED_SST_SATURATION_C,
}
