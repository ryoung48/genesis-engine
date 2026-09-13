import { COASTAL_BLEED } from "@/model/climate/ocean/coastal-bleed"
import { SVERDRUP_CURRENTS } from "@/model/climate/ocean/currents/sverdrup"
import type {
	ApplySSTToClimateParams,
	BuildOceanCurrentGridParams,
	ComputeCurrentsParams,
	FillEquatorialBandParams,
	ObservedOceanCurrentGridParams,
	ScaleFlowPairParams,
	SmoothWarmthParams,
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

// Production SST model: this coast-facing warm/cold table indexed by
// distance from the ITCZ (see computeSST below) is the world-gen pipeline's
// fast path for magnitude, derived from real GODAS/OISST (see the table's own
// comment). Which side of the table applies at each cell -- warm western-
// boundary current or cold eastern-boundary upwelling -- comes from
// SVERDRUP_CURRENTS' own wind-driven circulation rather than a land-side
// heuristic (see the sverdrup call in computeSST): its SST-anomaly sign is
// exactly that classification, computed directly from physics instead of
// inferred from moisture-advection asymmetry, so it generalizes to any
// coastline/wind combination the same heuristic couldn't. Only sverdrup's
// sign is used, not its magnitude -- its raw magnitude is 2-10x too weak
// without a vertical/heat-content layer (see src/test/earth/ocean-
// currents.md), which the calibrated table below supplies instead.

// SST anomaly (°C vs zonal mean) at which the observed (NOAA) overlay's
// warm/cold color scale saturates to ±1 -- tuned to the magnitude of real
// western-boundary currents like the Gulf Stream/Kuroshio.
const SST_ANOMALY_SATURATION_C = 4

// bandC's table (below) is itself real-anomaly-scale now, so the modeled
// output shares SST_ANOMALY_SATURATION_C with the observed overlay rather
// than needing its own inflated ceiling.

// SVERDRUP_CURRENTS.computeCurrents requires a saturation to normalize its
// own output, but only that output's SIGN is read below (see
// computeCurrents) -- clamping to [-1,1] never changes sign, so this value
// is otherwise
// arbitrary.
const SVERDRUP_CLASSIFICATION_SATURATION_C = 9

// Real warm/cold-current SST anomaly by distance from the (monthly, OBSERVED)
// thermal equator, °C -- binned directly from GODAS/OISST: for every ocean
// cell/month with real current speed >= 0.15 m/s (so only cells actually
// part of a real current count, not open-ocean noise), split by the real
// anomaly's own sign and averaged per 10-degree ITCZ-distance bucket. Unlike
// the old hand-fit west/east-facing-coast tables (which needed a separate
// CURRENT_STRENGTH_SCALE fudge to close a WorldClim land-temperature gap),
// these are the magnitudes real currents actually reach, not a proxy tuned
// indirectly through a downstream fit. Indexed by ITCZ distance rather than
// absolute latitude so the whole curve -- not just a wobble on top of it --
// migrates with the ITCZ's monthly drift; that drift is the sole source of
// seasonality, there's no separate per-month table or scaling term. The last
// two buckets (80, 90 degrees) had too few current-speed-qualifying samples
// to trust (12 and 0 for warm; 30 and 0 for cold) and are tapered toward zero
// instead, matching both real distant-pole current weakening and the
// original tables' own tail behavior.
//
// The raw bins at 60/70 degrees were 2.45/2.67 -- an increase past the 50-
// degree peak (2.94), driven by a small sample (n=628 at 70 degrees, likely
// a couple of strong high-latitude currents like the Norwegian Coastal
// Current) rather than a real trend: mean SST-anomaly magnitude should decay
// with distance from the ITCZ, not bump back up, and high-latitude cells
// land in exactly this range (|lat|>=60 averages ~70 degrees from the ITCZ),
// so the raw bump read as poles being implausibly as warm as the tropics'
// strongest currents. Pooled with isotonic regression (sample-weighted) over
// the 50/60/70-degree bins to enforce the expected monotonic decay from the
// peak outward, without discarding the real data: pooled 60/70 = (2.45*1978
// + 2.67*628) / (1978+628) = 2.50.
const WARM_BAND_C_TABLE = [
	1.23, 1.35, 1.49, 1.69, 2.11, 2.94, 2.5, 2.5, 1.25, 0,
]
const warmBandC = (dist: number) =>
	MATH.piecewise({
		domain: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
		range: WARM_BAND_C_TABLE,
		x: dist,
	})

const COLD_BAND_C_TABLE = [
	-1.13, -1.74, -1.6, -1.91, -3.01, -2.75, -2.76, -2.43, -1.2, 0,
]
const coldBandC = (dist: number) =>
	MATH.piecewise({
		domain: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
		range: COLD_BAND_C_TABLE,
		x: dist,
	})

const bandC = (dist: number, side: number): number =>
	side < 0 ? coldBandC(dist) : side > 0 ? warmBandC(dist) : 0

// Coast-hugging falloff -- currents/upwelling are a coastal phenomenon, not
// a whole-basin gyre, so the signal fades to nothing by ~800km offshore.
const COAST_DECAY_KM = 800

const coastDecay = (distCoastKm: number) =>
	1 - MATH.smoothstep({ edge0: 0, edge1: COAST_DECAY_KM, x: distCoastKm })

// Sverdrup's own dynamics are known-wrong within this band, not just weak:
// the Stommel/Sverdrup balance's leading term (beta d(psi)/dx) is driven by
// the Coriolis parameter f, which the circulation module already floors at 8
// degrees latitude (EKMAN_MIN_LAT_DEG in circulation/index.ts) because the
// balance itself breaks down as f -> 0, not because the real signal is small
// there. Verified directly: the western equatorial Pacific -- the real warm
// pool, the warmest ocean water on Earth -- classifies mostly COLD in this
// band (up to 71% of cells within 5-10 degrees of the equator), a large,
// spatially coherent wrong-way result, not noise a smoothing pass could
// clean up. A step below where the data actually stops being wrong (5-10
// degrees was only 5% cold).
//
// Rather than leaving this band blank (conspicuously empty right where the
// most famous SST pattern on Earth sits), fillEquatorialBand below
// propagates the classification in from just outside the band, where
// sverdrup's dynamics are valid -- still never trusting the band's own
// computed sign, but giving a spatially continuous answer instead of a void.
const EQUATORIAL_EXCLUSION_LAT_DEG = 10

// sverdrup's raw current speed runs 2-10x below real GODAS speed in most
// boundary-current regions (no bathymetry/nonlinear-eddy term, see
// src/test/earth/ocean-currents.md), weak enough that on the display map many
// real currents are barely distinguishable from open-ocean drift. Display-
// only legibility, not a physics fit.
const DISPLAY_FLOW_SPEED_SCALE = 3

// A multiplier alone can't rescue a current whose underlying signal is
// already near zero (e.g. N Atlantic Drift) -- multiplying ~0 stays ~0. This
// adds a flat floor on top of the scale to every cell with a defined
// direction, so even the weakest classified currents read as visibly moving
// rather than static; cells with exactly zero flow (no direction to give a
// floor to, e.g. land) are left at zero.
const DISPLAY_FLOW_SPEED_FLOOR_MS = 0.05

// A region can be mostly one classification with a noisy minority of cells
// sverdrup calls the other way (e.g. N Atlantic Drift, Antarctic coastal
// water) -- since sign alone decides which table applies and gets its full
// value (see computeSST), that minority's full-strength opposite-sign
// contribution can cancel much of the majority's, diluting the whole
// region's mean well below the table's actual value at that distance. This
// checkerboard-like noise turns out to be a background property of the
// whole approach (present, to varying degree, under any wind model -- see
// src/test/earth/ocean-currents.md) rather than something isolated to one
// region, so it needs a real kernel, not a couple of ad hoc passes: measured
// sign-flip rate between adjacent ocean cells drops with ring width (0 rings
// raw: Antarctica 7.7%, NAD 28.4%; 2 rings: 5.8%/18.5%; 3 rings: 5.4%/12.3%)
// but flattens out past 3 rings (4 rings: 5.1%/12.3%), so 3 is the point
// past which more smoothing buys little further cleanup for the added cost.
const WARMTH_SMOOTHING_RINGS = 3

function smoothWarmth({
	mesh,
	warmth,
	isOcean,
}: SmoothWarmthParams): Float32Array {
	const N = mesh.numRegions
	const out = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!isOcean[r]) continue
		const seen = new Set<number>([r])
		let frontier = [r]
		for (let ring = 0; ring < WARMTH_SMOOTHING_RINGS; ring++) {
			const next: number[] = []
			for (const cur of frontier) {
				for (
					let j = mesh.adjOffset[cur], jEnd = mesh.adjOffset[cur + 1];
					j < jEnd;
					j++
				) {
					const nb = mesh.adjList[j]
					if (!isOcean[nb] || seen.has(nb)) continue
					seen.add(nb)
					next.push(nb)
				}
			}
			frontier = next
		}
		let sum = 0
		for (const idx of seen) sum += warmth[idx]
		out[r] = sum / seen.size
	}
	return out
}

// Multi-source BFS flood fill, propagating each trusted (|lat| >=
// EQUATORIAL_EXCLUSION_LAT_DEG) cell's warmth inward to the excluded band --
// the same value-diffusion idea SVERDRUP_RASTER.fillGaps and
// COASTAL_BLEED.fillLand already use elsewhere in this codebase to cover a
// masked/unreliable region from its nearest trustworthy neighbours, rather
// than leaving it blank.
function fillEquatorialBand({
	mesh,
	warmth,
	latDeg,
	isOcean,
}: FillEquatorialBandParams): Float32Array {
	const N = mesh.numRegions
	const out = warmth.slice()
	const filled = new Uint8Array(N)
	const queue = new Int32Array(N)
	let head = 0
	let tail = 0
	for (let r = 0; r < N; r++) {
		if (!isOcean[r] || Math.abs(latDeg[r]) < EQUATORIAL_EXCLUSION_LAT_DEG)
			continue
		filled[r] = 1
		queue[tail++] = r
	}
	while (head < tail) {
		const r = queue[head++]
		for (
			let j = mesh.adjOffset[r], jEnd = mesh.adjOffset[r + 1];
			j < jEnd;
			j++
		) {
			const nb = mesh.adjList[j]
			if (!isOcean[nb] || filled[nb]) continue
			out[nb] = out[r]
			filled[nb] = 1
			queue[tail++] = nb
		}
	}
	return out
}

function scaleFlowPair({ u, v }: ScaleFlowPairParams): {
	u: Float32Array
	v: Float32Array
} {
	const outU = new Float32Array(u.length)
	const outV = new Float32Array(v.length)
	for (let i = 0; i < u.length; i++) {
		const su = u[i] * DISPLAY_FLOW_SPEED_SCALE
		const sv = v[i] * DISPLAY_FLOW_SPEED_SCALE
		const speed = Math.hypot(su, sv)
		if (speed <= 0) continue
		const boost = (speed + DISPLAY_FLOW_SPEED_FLOOR_MS) / speed
		outU[i] = su * boost
		outV[i] = sv * boost
	}
	return { u: outU, v: outV }
}

function computeCurrents({
	mesh,
	isLand,
	distCoast,
	landmarks,
	monthlyTEQ,
	climate,
	elevation_km,
	params,
	observedWind,
}: ComputeCurrentsParams): GenesisOceanCurrents {
	const N = mesh.numRegions
	const avgEdgeKm = UNITS.meanEdgeLengthKm({
		mesh,
		planetRadiusKm: params.planetRadiusKm,
	})
	const isLake = LANDMARKS.regionTypeMask({ landmarks, type: "lake" })
	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)

	// Sign feeds the table lookup below (see the module comment above); flow
	// is used as-is -- sverdrup's own wind-driven circulation is a real
	// current field, not a proxy needing a calibrated substitute the way its
	// SST magnitude does.
	const sverdrupCurrents = SVERDRUP_CURRENTS.computeCurrents({
		mesh,
		climate,
		elevation_km,
		isLand,
		landmarks,
		sstSaturationC: SVERDRUP_CLASSIFICATION_SATURATION_C,
		params,
		observedWind,
	})
	const isOcean = new Uint8Array(N)
	for (let r = 0; r < N; r++) isOcean[r] = !isLand[r] && !isLake[r] ? 1 : 0
	const smoothedWarmth = smoothWarmth({
		mesh,
		warmth: sverdrupCurrents.sst,
		isOcean,
	})
	const warmth = fillEquatorialBand({
		mesh,
		warmth: smoothedWarmth,
		latDeg,
		isOcean,
	})

	const sstMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
	const sst = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue
		// Sign only, not magnitude: sverdrup's own SST anomaly is 2-10x too weak
		// to use as a strength multiplier (that would just reintroduce the
		// weakness the calibrated table below exists to avoid). Any classified
		// cell -- warm or cold, however marginal -- gets the table's full value.
		const side = Math.sign(warmth[r])
		if (side === 0) continue
		const decay = coastDecay(distCoast[r])
		if (decay <= 0) continue
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const teq = monthlyTEQ[month][regionBin[r]]
			const dist = Math.abs(latDeg[r] - teq)
			const anomalyC = bandC(dist, side) * decay
			const value = MATH.clamp({
				value: anomalyC / SST_ANOMALY_SATURATION_C,
				lo: -1,
				hi: 1,
			})
			sstMonthly[month * N + r] = value
			sst[r] += value / CURRENT_EFFECT_MONTHS
		}
	}

	COASTAL_BLEED.fillLand({ mesh, isLand, isLake, avgEdgeKm, sst, sstMonthly })

	const annualFlow = scaleFlowPair({
		u: sverdrupCurrents.flowU,
		v: sverdrupCurrents.flowV,
	})
	const monthlyFlow = scaleFlowPair({
		u: sverdrupCurrents.flowUMonthly,
		v: sverdrupCurrents.flowVMonthly,
	})
	return {
		sst,
		sstMonthly,
		flowU: annualFlow.u,
		flowV: annualFlow.v,
		flowUMonthly: monthlyFlow.u,
		flowVMonthly: monthlyFlow.v,
	}
}

// Land cells only get the cosmetic coastal bleed of the nearest ocean sst,
// not a separately-modeled inland transport -- 1 is full bleed-through,
// matched to open water, and the physically-defensible ceiling for this
// constant (land literally receiving MORE than the adjacent water's own
// current strength would have no physical basis).
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
				SST_ANOMALY_SATURATION_C *
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
	computeCurrents,
	applySSTToClimate,
	buildOceanCurrentGrid,
	observedOceanCurrentGridForMonth,
	sstAnomalySaturationC: SST_ANOMALY_SATURATION_C,
}
