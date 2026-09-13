import { describe, expect, it } from "vitest"
import { SVERDRUP_CIRCULATION } from "@/model/climate/ocean/currents/sverdrup/circulation"
import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_HEAT_CARRIER } from "@/model/climate/ocean/currents/sverdrup/heat-carrier"
import { SVERDRUP_OVERTURNING } from "@/model/climate/ocean/currents/sverdrup/overturning"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import { SVERDRUP_SST_ANOMALY } from "@/model/climate/ocean/currents/sverdrup/sst-anomaly"
import { STOMMEL } from "@/model/climate/ocean/currents/sverdrup/stommel"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"
import { RAIN } from "@/model/climate/precipitation/rain"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { WIND } from "@/model/climate/weather/wind"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { UNITS } from "@/model/shared/units"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

type Box = { name: string; lat: [number, number]; lon: [number, number] }

const BOXES: Box[] = [
	{ name: "Gulf Stream", lat: [30, 42], lon: [-80, -55] },
	{ name: "Kuroshio", lat: [25, 40], lon: [122, 150] },
	{ name: "Brazil", lat: [-38, -20], lon: [-52, -38] },
	{ name: "Agulhas", lat: [-38, -25], lon: [25, 40] },
	{ name: "E Australian", lat: [-38, -25], lon: [150, 158] },
	{ name: "N Atlantic Drift", lat: [45, 55], lon: [-45, -15] },
	{ name: "California", lat: [22, 40], lon: [-130, -115] },
	{ name: "Canary", lat: [15, 32], lon: [-25, -12] },
	{ name: "Benguela", lat: [-32, -15], lon: [5, 15] },
	{ name: "Humboldt", lat: [-35, -10], lon: [-85, -72] },
	{ name: "N Eq Current Atl", lat: [10, 20], lon: [-55, -25] },
	{ name: "N Eq Current Pac", lat: [10, 20], lon: [150, 180] },
	{ name: "ACC 45-60S", lat: [-60, -45], lon: [-180, 180] },
]

const MONTHS = 12
const FEEDBACK_PASSES = 2
const RELEASE_YEARS = 1
const EXPORT_SPEED_M_S = 0.05
const OVERTURNING_YEARS = 50

describe("surface-fed heat carrier (diagnostic)", () => {
	it("transports surface heat under observed wind", () => {
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
		const annualMean = (monthly: Float32Array) => {
			const out = new Float32Array(N).fill(Number.NaN)
			for (let r = 0; r < N; r++) {
				let sum = 0
				let count = 0
				for (let month = 0; month < MONTHS; month++) {
					const value = monthly[month * N + r]
					if (!Number.isFinite(value)) continue
					sum += value
					count++
				}
				if (count > 0) out[r] = sum / count
			}
			return out
		}
		const { latDeg, lonDeg } = RAIN.getClimateGeometry(world.mesh)
		const observed = world.observedCurrent
		if (!observed?.real_sst_anomaly_monthly)
			throw new Error("Earth import is missing SST-anomaly data")
		if (!world.observedWind)
			throw new Error("Earth import is missing observed-wind data")

		const isLake = LANDMARKS.regionTypeMask({
			landmarks: world.landmarks,
			type: "lake",
		})
		const isOcean = new Uint8Array(N)
		for (let r = 0; r < N; r++)
			isOcean[r] = !world.isLand[r] && !isLake[r] ? 1 : 0
		const index = SVERDRUP_RASTER.buildIndex({ latDeg, lonDeg, isOcean })
		const annualInsolation = SVERDRUP_RASTER.average({
			index,
			values: annualMean(world.climate.insolation_monthly),
			include: isOcean,
		})
		const annualTemperature = SVERDRUP_RASTER.average({
			index,
			values: annualMean(world.climate.temperature_monthly),
			include: isOcean,
		})
		const planet: SverdrupPlanet = {
			coriolisSign: UNITS.isRetrogradeObliquity(world.params.obliquity)
				? -1
				: 1,
			rotationRateRadS: (2 * Math.PI) / (world.params.hoursPerDay * 3600),
			radiusM: world.params.planetRadiusKm * 1000,
			airDensityKgM3: 1.225 * (world.params.pressure ?? 1),
			seawaterDensityKgM3: MIXED_LAYER.seawaterDensityKgM3,
			gyreStrength: 1 - WIND.rotationCollapse(world.params.hoursPerDay),
		}
		const releaseSeconds = RELEASE_YEARS * world.params.daysPerYear * 86_400
		const overturning = SVERDRUP_OVERTURNING.temperatureDriven({
			ocean: index.ocean,
			temperatureC: annualTemperature,
			planet,
			turnoverSeconds: OVERTURNING_YEARS * world.params.daysPerYear * 86_400,
		})

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

		const baselineSstC = new Float32Array(N)
		const surfaceFedSstC = new Float32Array(N)
		let maxSolverConservationError = 0
		let annualPickupPowerW = 0
		for (let month = 0; month < MONTHS; month++) {
			const temperature = world.climate.temperature_monthly.subarray(
				month * N,
				(month + 1) * N,
			)
			let circulation = SVERDRUP_CIRCULATION.surface({
				index,
				tau: monthlyTau[month],
				psi: seasonal.monthlyPsi[month],
				planet,
				sstAnomaly: null,
			})
			let baselineAnomaly = SVERDRUP_SST_ANOMALY.solve({
				index,
				circulation,
				temperature,
				isOcean,
				planet,
				upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
			})
			for (let pass = 1; pass < FEEDBACK_PASSES; pass++) {
				circulation = SVERDRUP_CIRCULATION.surface({
					index,
					tau: monthlyTau[month],
					psi: seasonal.monthlyPsi[month],
					planet,
					sstAnomaly: baselineAnomaly,
				})
				baselineAnomaly = SVERDRUP_SST_ANOMALY.solve({
					index,
					circulation,
					temperature,
					isOcean,
					planet,
					upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
				})
			}

			const temperatureGradient = SVERDRUP_SST_ANOMALY.zonalGradient({
				index,
				temperature,
				isOcean,
				planet,
			})
			const { advective, vertical } = SVERDRUP_SST_ANOMALY.heatSource({
				circulation,
				ocean: index.ocean,
				temperatureGradient,
				upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
			})
			const baseSource = new Float32Array(index.ocean.length)
			for (let idx = 0; idx < baseSource.length; idx++)
				baseSource[idx] = advective[idx] + vertical[idx]
			const carrierFlow = {
				x: circulation.flow.x.slice(),
				y: circulation.flow.y.slice(),
			}
			for (let idx = 0; idx < carrierFlow.x.length; idx++) {
				carrierFlow.x[idx] += overturning.upperLimb.x[idx]
				carrierFlow.y[idx] += overturning.upperLimb.y[idx]
			}
			const transported = SVERDRUP_HEAT_CARRIER.transport({
				flow: carrierFlow,
				ocean: index.ocean,
				insolationWm2: annualInsolation,
				planet,
				releaseSeconds,
				albedo:
					world.params.albedo ?? CONSTANTS.embConstants.surface.ALBEDO.BASE,
				heatCapacityJm2K:
					MIXED_LAYER.seawaterDensityKgM3 *
					MIXED_LAYER.seawaterHeatCapacityJKgK *
					MIXED_LAYER.depthM,
				exportSpeedMps: EXPORT_SPEED_M_S,
			})
			maxSolverConservationError = Math.max(
				maxSolverConservationError,
				transported.solverConservationError,
			)
			annualPickupPowerW += transported.pickupPowerW / MONTHS
			const surfaceFedSource = baseSource.slice()
			for (let idx = 0; idx < surfaceFedSource.length; idx++)
				surfaceFedSource[idx] +=
					transported.releaseCPerS[idx] - transported.pickupCPerS[idx]
			const relaxationSeconds = new Float32Array(index.ocean.length).fill(
				MIXED_LAYER.relaxationSeconds,
			)
			const surfaceFedAnomaly = SVERDRUP_SST_ANOMALY.solveAnomaly({
				flow: circulation.flow,
				ocean: index.ocean,
				source: surfaceFedSource,
				planet,
				relaxationSeconds,
			})
			SVERDRUP_SST_ANOMALY.removeZonalMean({
				field: surfaceFedAnomaly,
				ocean: index.ocean,
			})

			const sampleOcean = (field: Float32Array) =>
				SVERDRUP_RASTER.sample({
					field,
					mask: index.ocean,
					latDeg,
					lonDeg,
					include: isOcean,
				})
			const monthBaseline = sampleOcean(baselineAnomaly)
			const monthSurfaceFed = sampleOcean(surfaceFedAnomaly)
			for (let r = 0; r < N; r++) {
				baselineSstC[r] += monthBaseline[r] / MONTHS
				surfaceFedSstC[r] += monthSurfaceFed[r] / MONTHS
			}
		}

		const observedSstC = annualMean(observed.real_sst_anomaly_monthly)
		const mean = (values: number[]) =>
			values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
		const regionsIn = (box: Box) => {
			const regions: number[] = []
			for (let r = 0; r < N; r++) {
				if (world.isLand[r] || !Number.isFinite(observedSstC[r])) continue
				if (latDeg[r] < box.lat[0] || latDeg[r] > box.lat[1]) continue
				if (lonDeg[r] < box.lon[0] || lonDeg[r] > box.lon[1]) continue
				regions.push(r)
			}
			return regions
		}

		for (const box of BOXES) {
			const regions = regionsIn(box)
			console.log(
				`HEATCARRIER ${box.name.padEnd(17)} ` +
					`baseline=${mean(regions.map((r) => baselineSstC[r])).toFixed(2)} ` +
					`surfaceFed=${mean(regions.map((r) => surfaceFedSstC[r])).toFixed(2)} ` +
					`real=${mean(regions.map((r) => observedSstC[r])).toFixed(2)}`,
			)
		}

		const midLatitudes: number[] = []
		for (let r = 0; r < N; r++) {
			if (world.isLand[r] || !Number.isFinite(observedSstC[r])) continue
			const absLat = Math.abs(latDeg[r])
			if (absLat >= 15 && absLat <= 60) midLatitudes.push(r)
		}
		const correlation = (model: Float32Array) => {
			const modelMean = mean(midLatitudes.map((r) => model[r]))
			const observedMean = mean(midLatitudes.map((r) => observedSstC[r]))
			let covariance = 0
			let modelVariance = 0
			let observedVariance = 0
			for (const r of midLatitudes) {
				covariance += (model[r] - modelMean) * (observedSstC[r] - observedMean)
				modelVariance += (model[r] - modelMean) ** 2
				observedVariance += (observedSstC[r] - observedMean) ** 2
			}
			return covariance / Math.sqrt(modelVariance * observedVariance)
		}
		console.log(
			`HEATCARRIER global 15-60 sst r baseline=${correlation(baselineSstC).toFixed(2)} ` +
				`surfaceFed=${correlation(surfaceFedSstC).toFixed(2)} ` +
				`pickup=${(annualPickupPowerW / 1e15).toFixed(2)}PW ` +
				`overturnMax=${overturning.maxUpperSpeedMps.toFixed(3)}m/s ` +
				`solverConservationError=${maxSolverConservationError.toExponential(2)}`,
		)

		expect(midLatitudes.length).toBeGreaterThan(0)
		expect(maxSolverConservationError).toBeLessThan(1e-2)
	})
}, 600_000)
