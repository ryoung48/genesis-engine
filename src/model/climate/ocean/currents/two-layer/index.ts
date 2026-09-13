import { COASTAL_BLEED } from "@/model/climate/ocean/coastal-bleed"
import { SVERDRUP_CIRCULATION } from "@/model/climate/ocean/currents/sverdrup/circulation"
import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import { SVERDRUP_SST_ANOMALY } from "@/model/climate/ocean/currents/sverdrup/sst-anomaly"
import { STOMMEL } from "@/model/climate/ocean/currents/sverdrup/stommel"
import { THERMOCLINE } from "@/model/climate/ocean/currents/sverdrup/thermocline"
import { TWO_LAYER_HEAT_BUDGET } from "@/model/climate/ocean/currents/two-layer/heat-budget"
import type {
	ComputeTwoLayerCurrentsParams,
	SeasonalMixedLayerDepthParams,
	TwoLayerHeatSourceParams,
	TwoLayerSourceTerms,
} from "@/model/climate/ocean/currents/two-layer/types"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"
import { RAIN } from "@/model/climate/precipitation/rain"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import { WIND } from "@/model/climate/weather/wind"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"

// Two-layer ocean SST model: a standalone module, not wired into production
// (see currents/sverdrup for the same standing). Built to test one specific
// hypothesis -- that N Atlantic Drift/Kuroshio's persistently weak SST
// anomaly is a missing-heat-STORAGE-AND-TRANSPORT problem, not a wind or
// circulation problem -- by giving the ocean a real reservoir (layer 2) a
// passive single-layer model can't have, see src/test/earth/ocean-currents.md.
// Layer 2 has its OWN advection (its own five-point-upwind solve, via its own
// geostrophic-only current -- see SVERDRUP_CIRCULATION.surface's
// `geostrophic` field, Ekman drift excluded since it decays away well above
// this layer's depth), not just local relaxation: a purely local reservoir
// can only retain whatever heat a column's own source term already
// generated, which is what an earlier entrainment/detrainment-only version
// of this model had, and it could not raise N Atlantic Drift's magnitude
// because that column's own local generation is what's weak -- the real
// missing mechanism is water that warmed up further south (Gulf Stream
// extension) physically transiting into the region, which only a transport
// term, not a storage term, can provide. Driven exclusively by real observed
// wind (never procedural) to isolate ocean-model error from wind-model
// error, matching this session's diagnostic methodology.

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const MONTHS = 12
const SEA_LEVEL_AIR_DENSITY_KG_M3 = 1.225
const SECONDS_PER_DAY = 86400
const DAYS_PER_YEAR = 365.25
const MONTH_SECONDS = (DAYS_PER_YEAR / MONTHS) * SECONDS_PER_DAY

// Backward-Euler step size -- 5 days was the anchor value the earlier
// (reverted) single-layer prognostic experiment validated for timestep
// convergence; reused here rather than re-deriving.
const STEP_DAYS = 5
const STEP_SECONDS = STEP_DAYS * SECONDS_PER_DAY
const STEPS_PER_MONTH = Math.max(1, Math.round(MONTH_SECONDS / STEP_SECONDS))

const MAX_SPINUP_YEARS = 15
const SPINUP_TOLERANCE = 1e-3

// Seasonal mixed-layer depth: convective overturning deepens the mixed
// layer in winter, a different mechanism from (and deeper than) the wind-
// driven Sverdrup thermocline (THERMOCLINE, a separate quantity used for
// upwelling gating, not touched here). Keyed to each region's own annual
// cycle -- how far a month has cooled below THAT region's own peak -- so it
// needs no calendar-month/hemisphere assumption.
//
// The max depth directly caps layer 1's own relaxation time (see
// RELAXATION_SECONDS_PER_METRE below), since it scales linearly with depth --
// an earlier 400m ceiling gave a ~631-day relaxation in deep-winter months,
// well past this model's monthly forcing cadence. A persistently-signed
// local source (e.g. Gulf Stream/Kuroshio's near-constant warm advection)
// then barely relaxes in winter and only partially resets in the brief fast
// (shallow-summer) window, so it compounds across spin-up years into an
// annual mean 2-3x too strong versus the memoryless per-month steady solve
// SVERDRUP_CURRENTS uses -- confirmed by isolating layer 1 alone (zero
// coupling to layer 2) and finding the SAME overshoot, so it long predates
// and is independent of the entrainment/detrainment coupling below. 100m
// keeps the relaxation ceiling within about a season, which resolved the
// overshoot in that same isolation test and, empirically (see
// ocean-currents.md), is also where the two-layer coupling stops making N
// Atlantic Drift's sign-agreement worse than the single-layer baseline and
// starts making Kuroshio's better.
const SEASONAL_MIN_DEPTH_M = 30
const SEASONAL_MAX_DEPTH_M = 100
const SEASONAL_DEFICIT_SCALE_C = 10

// Deep reservoir depth, fixed -- a typical seasonal-thermocline reservoir
// scale, not fit to any region's SST.
const DEEP_LAYER_DEPTH_M = 300

// Layer 1's air-sea exchange: same physical formula as MIXED_LAYER's own
// (rho*cp*h/lambda), evaluated at the seasonal depth above instead of a
// fixed 50m, since h1 varies here by construction. MIXED_LAYER only exports
// the combined relaxationSeconds (at its own fixed depth), not cp/lambda
// separately, so these two are restated here to rebuild the per-cell version.
const SEAWATER_HEAT_CAPACITY_J_KG_K = 3990
const AIR_SEA_EXCHANGE_W_M2_K = 30
const RELAXATION_SECONDS_PER_METRE =
	(MIXED_LAYER.seawaterDensityKgM3 * SEAWATER_HEAT_CAPACITY_J_KG_K) /
	AIR_SEA_EXCHANGE_W_M2_K

// Layer 2 never touches the atmosphere directly -- its only loss is slow
// mixing back toward the background ocean state, a much longer timescale
// than layer 1's ~80-day (at the 100m depth cap, up to ~150-day) air-sea
// exchange -- matching the real seasonal re-emergence cycle (roughly one
// winter to the next), not the multi-year memory an earlier 3yr guess gave,
// which let the reservoir accumulate a persistent bias across many spin-up
// years (see SEASONAL_MAX_DEPTH_M above for the related, larger fix).
const DEEP_RELAXATION_YEARS = 1
const DEEP_RELAXATION_SECONDS =
	DEEP_RELAXATION_YEARS * DAYS_PER_YEAR * SECONDS_PER_DAY

const DOWNWELLING_WARMING_FRACTION = 0.3
const MAX_VERTICAL_VELOCITY_M_S = 1e-4
const THERMOCLINE_SCALE_M = 150

function seasonalMixedLayerDepthM({
	index,
	temperature,
	temperatureAnnualMax,
	isOcean,
}: SeasonalMixedLayerDepthParams): Float32Array {
	const N = temperature.length
	const meshDepth = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const fraction = MATH.clamp({
			value:
				(temperatureAnnualMax[r] - temperature[r]) / SEASONAL_DEFICIT_SCALE_C,
			lo: 0,
			hi: 1,
		})
		meshDepth[r] =
			SEASONAL_MIN_DEPTH_M +
			(SEASONAL_MAX_DEPTH_M - SEASONAL_MIN_DEPTH_M) * fraction
	}
	return SVERDRUP_RASTER.average({ index, values: meshDepth, include: isOcean })
}

function heatSource({
	circulation,
	ocean,
	temperatureGradient,
	upwelledDeficitC,
	mixedLayerDepthM,
}: TwoLayerHeatSourceParams): TwoLayerSourceTerms {
	const { flow, divergence, thermoclineDepth } = circulation
	const advective = new Float32Array(CELLS)
	const vertical = new Float32Array(CELLS)
	for (let j = 0; j < H; j++) {
		for (let i = 0; i < W; i++) {
			const idx = j * W + i
			if (!ocean[idx]) continue
			const deficit =
				upwelledDeficitC *
				Math.exp(
					-(thermoclineDepth[idx] - THERMOCLINE.easternDepthM) /
						THERMOCLINE_SCALE_M,
				)
			const w = MATH.clamp({
				value: divergence[idx],
				lo: -MAX_VERTICAL_VELOCITY_M_S,
				hi: MAX_VERTICAL_VELOCITY_M_S,
			})
			advective[idx] = -flow.y[idx] * temperatureGradient[j]
			vertical[idx] =
				w > 0
					? (-w * deficit) / mixedLayerDepthM[idx]
					: (-w * upwelledDeficitC * DOWNWELLING_WARMING_FRACTION) /
						mixedLayerDepthM[idx]
		}
	}
	return { advective, vertical }
}

function computeCurrents({
	mesh,
	climate,
	isLand,
	landmarks,
	sstSaturationC,
	params,
	observedWind,
}: ComputeTwoLayerCurrentsParams): GenesisOceanCurrents {
	const N = mesh.numRegions
	const isLake = LANDMARKS.regionTypeMask({ landmarks, type: "lake" })
	const isOcean = new Uint8Array(N)
	for (let r = 0; r < N; r++) isOcean[r] = !isLand[r] && !isLake[r] ? 1 : 0
	const { latDeg, lonDeg } = RAIN.getClimateGeometry(mesh)
	const index = SVERDRUP_RASTER.buildIndex({ latDeg, lonDeg, isOcean })
	const planet: SverdrupPlanet = {
		coriolisSign: UNITS.isRetrogradeObliquity(params.obliquity) ? -1 : 1,
		rotationRateRadS: (2 * Math.PI) / (params.hoursPerDay * 3600),
		radiusM: params.planetRadiusKm * 1000,
		airDensityKgM3: SEA_LEVEL_AIR_DENSITY_KG_M3 * (params.pressure ?? 1),
		seawaterDensityKgM3: MIXED_LAYER.seawaterDensityKgM3,
		gyreStrength: 1 - WIND.rotationCollapse(params.hoursPerDay),
	}

	const oceanRaster = new Uint8Array(CELLS)
	for (let i = 0; i < CELLS; i++) oceanRaster[i] = index.ocean[i]

	// Wind-only circulation for every month, reusing sverdrup's own dynamics
	// unchanged -- no baroclinic feedback loop in this version, since the
	// anomaly it would feed back is now prognostic rather than solved fresh
	// each month; a coupled version is a possible follow-up once the core
	// two-layer thermodynamics are validated.
	const operator = STOMMEL.build({ ocean: index.ocean, planet })
	const monthlyTau = []
	const monthlyCurl = []
	for (let month = 0; month < MONTHS; month++) {
		const wind = WIND.observedWindVectorsForMonth({
			observedWind,
			numRegions: N,
			month,
		})
		const forcing = SVERDRUP_CIRCULATION.forcing({ index, wind, planet })
		monthlyTau.push(forcing.tau)
		monthlyCurl.push(forcing.curl)
	}
	const seasonal = STOMMEL.solveSeasonal({ operator, monthlyCurl, planet })
	const monthlyCirculation = monthlyTau.map((tau, month) =>
		SVERDRUP_CIRCULATION.surface({
			index,
			tau,
			psi: seasonal.monthlyPsi[month],
			planet,
			sstAnomaly: null,
		}),
	)

	// Each region's own annual peak temperature, for the seasonal mixed-
	// layer depth: how far a month has cooled below this stands in for
	// convective overturning.
	const temperatureAnnualMax = new Float32Array(N).fill(-Infinity)
	for (let month = 0; month < MONTHS; month++) {
		const monthTemperature = climate.temperature_monthly.subarray(
			month * N,
			(month + 1) * N,
		)
		for (let r = 0; r < N; r++)
			if (monthTemperature[r] > temperatureAnnualMax[r])
				temperatureAnnualMax[r] = monthTemperature[r]
	}

	const monthlyMixedLayerDepthM: Float32Array[] = []
	const monthlyRelaxationSecondsLayer1: Float32Array[] = []
	const monthlySource1: Float32Array[] = []
	for (let month = 0; month < MONTHS; month++) {
		const temperature = climate.temperature_monthly.subarray(
			month * N,
			(month + 1) * N,
		)
		const depth = seasonalMixedLayerDepthM({
			index,
			temperature,
			temperatureAnnualMax,
			isOcean,
		})
		monthlyMixedLayerDepthM.push(depth)
		const relax = new Float32Array(CELLS)
		for (let i = 0; i < CELLS; i++)
			relax[i] = RELAXATION_SECONDS_PER_METRE * depth[i]
		monthlyRelaxationSecondsLayer1.push(relax)

		const temperatureGradient = SVERDRUP_SST_ANOMALY.zonalGradient({
			index,
			temperature,
			isOcean,
			planet,
		})
		const { advective, vertical } = heatSource({
			circulation: monthlyCirculation[month],
			ocean: index.ocean,
			temperatureGradient,
			upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
			mixedLayerDepthM: depth,
		})
		const source = new Float32Array(CELLS)
		for (let i = 0; i < CELLS; i++) source[i] = advective[i] + vertical[i]
		monthlySource1.push(source)
	}

	const monthlyEntrainmentVelocityMS = monthlyMixedLayerDepthM.map(
		(depth, month) => {
			const previous = monthlyMixedLayerDepthM[(month - 1 + MONTHS) % MONTHS]
			return TWO_LAYER_HEAT_BUDGET.entrainmentVelocityMS({
				mixedLayerDepthM: depth,
				previousMixedLayerDepthM: previous,
				dtSeconds: MONTH_SECONDS,
			})
		},
	)
	const monthlyExchangeVelocityMS = monthlyMixedLayerDepthM.map(
		(depth, month) => {
			const previous = monthlyMixedLayerDepthM[(month - 1 + MONTHS) % MONTHS]
			return TWO_LAYER_HEAT_BUDGET.exchangeVelocityMS({
				mixedLayerDepthM: depth,
				previousMixedLayerDepthM: previous,
				dtSeconds: MONTH_SECONDS,
			})
		},
	)

	const relaxationSecondsLayer2 = new Float32Array(CELLS).fill(
		DEEP_RELAXATION_SECONDS,
	)
	const deepLayerDepthM = new Float32Array(CELLS).fill(DEEP_LAYER_DEPTH_M)
	const zeroSource = new Float32Array(CELLS)

	// Layer 1 and layer 2 are each solved with their own spatial (five-point
	// upwind) step, coupled by lagging one substep behind the other: layer 1
	// couples to the PREVIOUS substep's T2 (entrainment target), then layer 2
	// couples to the JUST-SOLVED new T1 (exchange target). At dtSeconds=5
	// days this lag is far smaller than either layer's own relaxation or
	// advection timescale, so it's a negligible approximation, not a
	// different model -- and it's what makes giving layer 2 its own spatial
	// solve tractable at all (an exactly-simultaneous coupled solve would
	// need a genuine 2-field linear system each sweep, not two independent
	// five-point solves).
	function runYear(t1Start: Float32Array, t2Start: Float32Array) {
		let t1 = t1Start
		let t2 = t2Start
		const monthlyT1: Float32Array[] = []
		for (let month = 0; month < MONTHS; month++) {
			const flow2 = monthlyCirculation[month].geostrophic
			for (let step = 0; step < STEPS_PER_MONTH; step++) {
				const effective1 = TWO_LAYER_HEAT_BUDGET.computeEffectiveLayer({
					source: monthlySource1[month],
					couplingVelocityMS: monthlyEntrainmentVelocityMS[month],
					layerDepthM: monthlyMixedLayerDepthM[month],
					relaxationSeconds: monthlyRelaxationSecondsLayer1[month],
					couplingTarget: t2,
				})
				const nextT1 = TWO_LAYER_HEAT_BUDGET.stepLayer({
					flow: monthlyCirculation[month].flow,
					ocean: oceanRaster,
					source: effective1.source,
					planet,
					relaxationSeconds: effective1.relaxationSeconds,
					previous: t1,
					dtSeconds: STEP_SECONDS,
				})
				const effective2 = TWO_LAYER_HEAT_BUDGET.computeEffectiveLayer({
					source: zeroSource,
					couplingVelocityMS: monthlyExchangeVelocityMS[month],
					layerDepthM: deepLayerDepthM,
					relaxationSeconds: relaxationSecondsLayer2,
					couplingTarget: nextT1,
				})
				const nextT2 = TWO_LAYER_HEAT_BUDGET.stepLayer({
					flow: flow2,
					ocean: oceanRaster,
					source: effective2.source,
					planet,
					relaxationSeconds: effective2.relaxationSeconds,
					previous: t2,
					dtSeconds: STEP_SECONDS,
				})
				t1 = nextT1
				t2 = nextT2
			}
			monthlyT1.push(t1)
		}
		return { t1, t2, monthlyT1 }
	}

	// Spin up from rest until January's own state stops changing year over
	// year (same criterion the earlier reverted prognostic experiment used).
	let t1: Float32Array = new Float32Array(CELLS)
	let t2: Float32Array = new Float32Array(CELLS)
	let previousJanuary: Float32Array | null = null
	let lastYear: ReturnType<typeof runYear> | null = null
	for (let year = 0; year < MAX_SPINUP_YEARS; year++) {
		const result = runYear(t1, t2)
		t1 = result.t1
		t2 = result.t2
		lastYear = result
		const january = result.monthlyT1[0]
		if (previousJanuary) {
			let diffSq = 0
			let normSq = 0
			for (let i = 0; i < CELLS; i++) {
				if (!oceanRaster[i]) continue
				diffSq += (january[i] - previousJanuary[i]) ** 2
				normSq += january[i] ** 2
			}
			const relChange = Math.sqrt(diffSq) / Math.max(Math.sqrt(normSq), 1e-9)
			if (relChange < SPINUP_TOLERANCE) break
		}
		previousJanuary = january.slice()
	}
	if (!lastYear) throw new Error("two-layer spin-up produced no output")

	const sstMonthly = new Float32Array(N * MONTHS)
	const sst = new Float32Array(N)
	const flowU = new Float32Array(N)
	const flowV = new Float32Array(N)
	const flowUMonthly = new Float32Array(N * MONTHS)
	const flowVMonthly = new Float32Array(N * MONTHS)
	const sampleOcean = (field: Float32Array) =>
		SVERDRUP_RASTER.sample({
			field,
			mask: index.ocean,
			latDeg,
			lonDeg,
			include: isOcean,
		})
	for (let month = 0; month < MONTHS; month++) {
		const anomaly = lastYear.monthlyT1[month].slice()
		SVERDRUP_SST_ANOMALY.removeZonalMean({ field: anomaly, ocean: index.ocean })
		const sstC = sampleOcean(anomaly)
		const monthSst = new Float32Array(N)
		for (let r = 0; r < N; r++)
			monthSst[r] = MATH.clamp({
				value: sstC[r] / sstSaturationC,
				lo: -1,
				hi: 1,
			})
		const monthFlowU = sampleOcean(monthlyCirculation[month].flow.x)
		const monthFlowV = sampleOcean(monthlyCirculation[month].flow.y)
		sstMonthly.set(monthSst, month * N)
		flowUMonthly.set(monthFlowU, month * N)
		flowVMonthly.set(monthFlowV, month * N)
		for (let r = 0; r < N; r++) {
			sst[r] += monthSst[r] / MONTHS
			flowU[r] += monthFlowU[r] / MONTHS
			flowV[r] += monthFlowV[r] / MONTHS
		}
	}

	COASTAL_BLEED.fillLand({
		mesh,
		isLand,
		isLake,
		avgEdgeKm: UNITS.meanEdgeLengthKm({
			mesh,
			planetRadiusKm: params.planetRadiusKm,
		}),
		sst,
		sstMonthly,
	})
	return { sst, sstMonthly, flowU, flowV, flowUMonthly, flowVMonthly }
}

export const TWO_LAYER_CURRENTS = {
	computeCurrents,
}
