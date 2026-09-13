import { describe, expect, it } from "vitest"
import { SVERDRUP_CIRCULATION } from "@/model/climate/ocean/currents/sverdrup/circulation"
import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import { SVERDRUP_SST_ANOMALY } from "@/model/climate/ocean/currents/sverdrup/sst-anomaly"
import { STOMMEL } from "@/model/climate/ocean/currents/sverdrup/stommel"
import { TWO_LAYER_HEAT_BUDGET } from "@/model/climate/ocean/currents/two-layer/heat-budget"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// DIAGNOSTIC ONLY -- now that layer 2 has its own geostrophic advection
// (see two-layer/index.ts), tests whether a LONGER deep-relaxation memory
// (safe to try now that it's no longer entangled with the old 400m/631-day
// layer-1 bug) lets transported heat survive its multi-month transit from
// Gulf Stream to N Atlantic Drift instead of relaxing away en route.

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const MONTHS = 12
const SEA_LEVEL_AIR_DENSITY_KG_M3 = 1.225
const SECONDS_PER_DAY = 86400
const DAYS_PER_YEAR = 365.25
const MONTH_SECONDS = (DAYS_PER_YEAR / MONTHS) * SECONDS_PER_DAY
const STEP_DAYS = 5
const STEP_SECONDS = STEP_DAYS * SECONDS_PER_DAY
const STEPS_PER_MONTH = Math.max(1, Math.round(MONTH_SECONDS / STEP_SECONDS))
const MAX_SPINUP_YEARS = 20
const SPINUP_TOLERANCE = 1e-3
const SEASONAL_MIN_DEPTH_M = 30
const SEASONAL_MAX_DEPTH_M = 100
const SEASONAL_DEFICIT_SCALE_C = 10
const DEEP_LAYER_DEPTH_M = 300
const SEAWATER_HEAT_CAPACITY_J_KG_K = 3990
const AIR_SEA_EXCHANGE_W_M2_K = 30
const RELAXATION_SECONDS_PER_METRE =
	(MIXED_LAYER.seawaterDensityKgM3 * SEAWATER_HEAT_CAPACITY_J_KG_K) /
	AIR_SEA_EXCHANGE_W_M2_K
const DOWNWELLING_WARMING_FRACTION = 0.3
const MAX_VERTICAL_VELOCITY_M_S = 1e-4
const THERMOCLINE_SCALE_M = 150

type Box = { name: string; lat: [number, number]; lon: [number, number] }
const BOXES: Box[] = [
	{ name: "Gulf Stream", lat: [30, 42], lon: [-80, -55] },
	{ name: "Kuroshio", lat: [25, 40], lon: [122, 150] },
	{ name: "N Atlantic Drift", lat: [45, 55], lon: [-45, -15] },
]

describe("two-layer transport tau2 sweep (diagnostic)", () => {
	it("tests whether longer deep-reservoir memory lets transport reach NAD", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const currentU = loadEarthMonthlyRaster("earth-real-current-u")
		const currentV = loadEarthMonthlyRaster("earth-real-current-v")
		const sstAnomaly = loadEarthMonthlyRaster("earth-real-sst-anomaly")
		const realWindU = loadEarthMonthlyRaster("earth-real-wind-u")
		const realWindV = loadEarthMonthlyRaster("earth-real-wind-v")

		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
			params: {
				seed: 14963991,
				numPoints: DEFAULT_WORLD_PARAMS.numPoints,
				jitter: DEFAULT_WORLD_PARAMS.jitter,
				grayscale: earth.grayscale,
				imageWidth: earth.width,
				imageHeight: earth.height,
				coastlineMask: coastline.grayscale,
				maskWidth: coastline.width,
				maskHeight: coastline.height,
				lakeMask: lake.grayscale,
				lakeMaskWidth: lake.width,
				lakeMaskHeight: lake.height,
				realCurrentUMonthly: currentU.monthly,
				realCurrentVMonthly: currentV.monthly,
				realCurrentWidth: currentU.width,
				realCurrentHeight: currentU.height,
				realCurrentMonths: currentU.months,
				realCurrentScale: currentU.scale,
				realCurrentNoData: currentU.nodata,
				realSstAnomalyMonthly: sstAnomaly.monthly,
				realSstAnomalyWidth: sstAnomaly.width,
				realSstAnomalyHeight: sstAnomaly.height,
				realSstAnomalyMonths: sstAnomaly.months,
				realSstAnomalyScale: sstAnomaly.scale,
				realSstAnomalyNoData: sstAnomaly.nodata,
				realWindUMonthly: realWindU.monthly,
				realWindVMonthly: realWindV.monthly,
				realWindWidth: realWindU.width,
				realWindHeight: realWindU.height,
				realWindMonths: realWindU.months,
				realWindScale: realWindU.scale,
				realWindNoData: realWindU.nodata,
				terrainWarp: 0,
				smoothing: 0,
				hydraulicErosion: 0,
				thermalErosion: 0,
				ridgeSharpening: 0,
				glacialErosion: 0,
				seaLevel: DEFAULT_WORLD_PARAMS.seaLevel,
				volcanism: 1,
				craters: 0,
				maxElevation: DEFAULT_WORLD_PARAMS.maxElevation,
				planetRadiusKm: DEFAULT_WORLD_PARAMS.planetRadiusKm,
				obliquity: DEFAULT_WORLD_PARAMS.obliquity,
				eccentricity: DEFAULT_WORLD_PARAMS.eccentricity,
				spectralClass: DEFAULT_WORLD_PARAMS.spectralClass,
				starSubtype: DEFAULT_WORLD_PARAMS.starSubtype,
				orbitalDistanceAU: DEFAULT_WORLD_PARAMS.orbitalDistanceAU,
				daysPerYear: DEFAULT_WORLD_PARAMS.daysPerYear,
				hoursPerDay: DEFAULT_WORLD_PARAMS.hoursPerDay,
				substellarLon: DEFAULT_WORLD_PARAMS.substellarLon,
				perihelion: DEFAULT_WORLD_PARAMS.perihelion,
				pressure: DEFAULT_WORLD_PARAMS.pressure,
			},
		})

		const N = world.mesh.numRegions
		if (!world.observedWind)
			throw new Error("Earth import missing observed wind")
		const isLake = LANDMARKS.regionTypeMask({
			landmarks: world.landmarks,
			type: "lake",
		})
		const isOcean = new Uint8Array(N)
		for (let r = 0; r < N; r++)
			isOcean[r] = !world.isLand[r] && !isLake[r] ? 1 : 0
		const { latDeg, lonDeg } = RAIN.getClimateGeometry(world.mesh)
		const index = SVERDRUP_RASTER.buildIndex({ latDeg, lonDeg, isOcean })
		const planet: SverdrupPlanet = {
			coriolisSign: UNITS.isRetrogradeObliquity(world.params.obliquity)
				? -1
				: 1,
			rotationRateRadS: (2 * Math.PI) / (world.params.hoursPerDay * 3600),
			radiusM: world.params.planetRadiusKm * 1000,
			airDensityKgM3:
				SEA_LEVEL_AIR_DENSITY_KG_M3 * (world.params.pressure ?? 1),
			seawaterDensityKgM3: MIXED_LAYER.seawaterDensityKgM3,
			gyreStrength: 1 - WIND.rotationCollapse(world.params.hoursPerDay),
		}
		const oceanRaster = new Uint8Array(CELLS)
		for (let i = 0; i < CELLS; i++) oceanRaster[i] = index.ocean[i]

		const operator = STOMMEL.build({ ocean: index.ocean, planet })
		const monthlyTau = []
		const monthlyCurl = []
		for (let month = 0; month < MONTHS; month++) {
			const wind = WIND.observedWindVectorsForMonth({
				observedWind: world.observedWind,
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

		const temperatureAnnualMax = new Float32Array(N).fill(-Infinity)
		for (let month = 0; month < MONTHS; month++) {
			const monthTemperature = world.climate.temperature_monthly.subarray(
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
			const temperature = world.climate.temperature_monthly.subarray(
				month * N,
				(month + 1) * N,
			)
			const meshDepth = new Float32Array(N)
			for (let r = 0; r < N; r++) {
				const fraction = MATH.clamp({
					value:
						(temperatureAnnualMax[r] - temperature[r]) /
						SEASONAL_DEFICIT_SCALE_C,
					lo: 0,
					hi: 1,
				})
				meshDepth[r] =
					SEASONAL_MIN_DEPTH_M +
					(SEASONAL_MAX_DEPTH_M - SEASONAL_MIN_DEPTH_M) * fraction
			}
			const depth = SVERDRUP_RASTER.average({
				index,
				values: meshDepth,
				include: isOcean,
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
			const circulation = monthlyCirculation[month]
			const { flow, divergence, thermoclineDepth } = circulation
			const source = new Float32Array(CELLS)
			for (let j = 0; j < H; j++) {
				for (let i = 0; i < W; i++) {
					const idx = j * W + i
					if (!index.ocean[idx]) continue
					const deficit =
						SVERDRUP_SST_ANOMALY.upwelledDeficitC *
						Math.exp(-(thermoclineDepth[idx] - 100) / THERMOCLINE_SCALE_M)
					const w = MATH.clamp({
						value: divergence[idx],
						lo: -MAX_VERTICAL_VELOCITY_M_S,
						hi: MAX_VERTICAL_VELOCITY_M_S,
					})
					const advective = -flow.y[idx] * temperatureGradient[j]
					const vertical =
						w > 0
							? (-w * deficit) / depth[idx]
							: (-w *
									SVERDRUP_SST_ANOMALY.upwelledDeficitC *
									DOWNWELLING_WARMING_FRACTION) /
								depth[idx]
					source[idx] = advective + vertical
				}
			}
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

		const sampleOcean = (field: Float32Array) =>
			SVERDRUP_RASTER.sample({
				field,
				mask: index.ocean,
				latDeg,
				lonDeg,
				include: isOcean,
			})
		const annualMean = (monthly: Float32Array | undefined) => {
			const out = new Float32Array(N).fill(Number.NaN)
			if (!monthly) return out
			for (let r = 0; r < N; r++) {
				let sum = 0
				let count = 0
				for (let m = 0; m < MONTHS; m++) {
					const value = monthly[m * N + r]
					if (!Number.isFinite(value)) continue
					sum += value
					count++
				}
				if (count > 0) out[r] = sum / count
			}
			return out
		}
		const observed = world.observedCurrent
		const obsSst = annualMean(observed?.real_sst_anomaly_monthly)
		const mean = (values: number[]) =>
			values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
		const regionsIn = (box: Box) => {
			const regions: number[] = []
			for (let r = 0; r < N; r++) {
				if (world.isLand[r]) continue
				if (latDeg[r] < box.lat[0] || latDeg[r] > box.lat[1]) continue
				if (lonDeg[r] < box.lon[0] || lonDeg[r] > box.lon[1]) continue
				if (!Number.isFinite(obsSst[r])) continue
				regions.push(r)
			}
			return regions
		}
		const boxRegions = BOXES.map((box) => ({ box, regions: regionsIn(box) }))
		const deepLayerDepthM = new Float32Array(CELLS).fill(DEEP_LAYER_DEPTH_M)
		const zeroSource = new Float32Array(CELLS)

		function runForTau2(deepRelaxationYears: number) {
			const deepRelaxationSeconds =
				deepRelaxationYears * DAYS_PER_YEAR * SECONDS_PER_DAY
			const relaxationSecondsLayer2 = new Float32Array(CELLS).fill(
				deepRelaxationSeconds,
			)

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
					const relChange =
						Math.sqrt(diffSq) / Math.max(Math.sqrt(normSq), 1e-9)
					if (relChange < SPINUP_TOLERANCE) break
				}
				previousJanuary = january.slice()
			}
			if (!lastYear) throw new Error("no output")

			const sst = new Float32Array(N)
			for (let month = 0; month < MONTHS; month++) {
				const anomaly = lastYear.monthlyT1[month].slice()
				SVERDRUP_SST_ANOMALY.removeZonalMean({
					field: anomaly,
					ocean: index.ocean,
				})
				const monthSst = sampleOcean(anomaly)
				for (let r = 0; r < N; r++) sst[r] += monthSst[r] / MONTHS
			}

			for (const { box, regions } of boxRegions) {
				const sstC = regions.map((r) => sst[r])
				const agree =
					regions.filter((r) => Math.sign(sst[r]) === Math.sign(obsSst[r]))
						.length / Math.max(1, regions.length)
				console.log(
					`TAU2 tau2=${deepRelaxationYears}y ${box.name.padEnd(17)} sst=${mean(sstC).toFixed(2).padStart(6)} real=${mean(
						regions.map((r) => obsSst[r]),
					)
						.toFixed(2)
						.padStart(6)} sign-agree=${agree.toFixed(2)}`,
				)
			}
		}

		for (const tau2Years of [1, 2, 3, 5]) {
			const start = Date.now()
			runForTau2(tau2Years)
			console.log(`TAU2 tau2=${tau2Years}y ms=${Date.now() - start}`)
		}

		expect(boxRegions[0].regions.length).toBeGreaterThan(0)
	})
}, 900_000)
