import { describe, expect, it } from "vitest"
import { SVERDRUP_CIRCULATION } from "@/model/climate/ocean/currents/sverdrup/circulation"
import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_HEAT_TRANSPORT } from "@/model/climate/ocean/currents/sverdrup/heat-transport"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import { SVERDRUP_SST_ANOMALY } from "@/model/climate/ocean/currents/sverdrup/sst-anomaly"
import { STOMMEL } from "@/model/climate/ocean/currents/sverdrup/stommel"
import { THERMOCLINE } from "@/model/climate/ocean/currents/sverdrup/thermocline"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { UNITS } from "@/model/shared/units"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// DIAGNOSTIC ONLY -- asserts nothing about accuracy, and nothing here gates a
// build. The SST-anomaly source is two physically distinct terms summed
// together before the Gauss-Seidel solve ever sees them: horizontal
// advection across the background meridional gradient (`advective`), and
// Ekman upwelling/downwelling gated by thermocline depth (`vertical`). The
// final SST alone can't say which one is responsible for a region's error --
// a region could be wrong because upwelling is too weak, or because
// horizontal advection is fighting it to a standstill, and both would look
// the same in the combined number. This solves each term alone (plus the
// combined baseline, as a check that summing the two solves matches
// SVERDRUP_SST_ANOMALY.solve's own combined solve) to tell them apart.
//
// Same configuration as the other current diagnostics for comparability:
// observed NCEP wind, the two-pass baroclinic fixed point sverdrup/index.ts
// ships with, real GODAS/OISST compared against but never fed in.

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
const ATLANTIC_OVERTURNING_M3_S = 17.5e6
const ATLANTIC_OVERTURNING_SOUTH_LAT_DEG = 25
const ATLANTIC_OVERTURNING_NORTH_LAT_DEG = 60
const ATLANTIC_OVERTURNING_WEST_LON_DEG = -80
const ATLANTIC_OVERTURNING_EAST_LON_DEG = 20
const ATLANTIC_HEAT_SOURCE_SOUTH_LAT_DEG = 10
const ATLANTIC_HEAT_SOURCE_NORTH_LAT_DEG = 25
const ATLANTIC_HEAT_SOURCE_WEST_LON_DEG = -80
const ATLANTIC_HEAT_SOURCE_EAST_LON_DEG = -20
const ATLANTIC_HEAT_SINK_SOUTH_LAT_DEG = 45
const ATLANTIC_HEAT_SINK_NORTH_LAT_DEG = 60
const ATLANTIC_HEAT_SINK_WEST_LON_DEG = -60
const ATLANTIC_HEAT_SINK_EAST_LON_DEG = 10
const NORTH_ATLANTIC_HEAT_CONVERGENCE_W = 0.36e15
// Mirrors FEEDBACK_PASSES in sverdrup/index.ts -- reimplements the per-month
// solve loop by hand to get at intermediate fields, so it has to replicate
// the same fixed-point iteration.
const FEEDBACK_PASSES = 2

describe("SST-anomaly source decomposition (diagnostic)", () => {
	it("reports advective vs vertical contribution per region", () => {
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
		const { latDeg, lonDeg } = RAIN.getClimateGeometry(world.mesh)
		const observed = world.observedCurrent
		if (!observed?.real_sst_anomaly_monthly)
			throw new Error("Earth import is missing SST-anomaly data")

		const isLake = LANDMARKS.regionTypeMask({
			landmarks: world.landmarks,
			type: "lake",
		})
		const isOcean = new Uint8Array(N)
		for (let r = 0; r < N; r++)
			isOcean[r] = !world.isLand[r] && !isLake[r] ? 1 : 0
		const index = SVERDRUP_RASTER.buildIndex({ latDeg, lonDeg, isOcean })
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

		const CELLS = SVERDRUP_RASTER.width * SVERDRUP_RASTER.height
		const advSstC = new Float32Array(N)
		const vertSstC = new Float32Array(N)
		const bothSstC = new Float32Array(N)
		const fixedTransportSstC = new Float32Array(N)
		const thermoclineTransportSstC = new Float32Array(N)
		const overturningTransportSstC = new Float32Array(N)
		const overturningHeatSstC = new Float32Array(N)
		const fixedLayerDepthM = new Float32Array(CELLS).fill(
			THERMOCLINE.easternDepthM,
		)
		const zeroTransport = {
			x: new Float32Array(CELLS),
			y: new Float32Array(CELLS),
		}
		const atlanticTransport = {
			x: new Float32Array(CELLS),
			y: new Float32Array(CELLS),
		}
		const metersPerDeg = planet.radiusM * (Math.PI / 180)
		const atlanticHeatSource = new Uint8Array(CELLS)
		const atlanticHeatSink = new Uint8Array(CELLS)
		let sourceAreaM2 = 0
		let sinkAreaM2 = 0
		for (let j = 0; j < SVERDRUP_RASTER.height; j++) {
			const lat = j - 90
			const rowCellAreaM2 =
				metersPerDeg * metersPerDeg * SVERDRUP_RASTER.rowCos[j]
			for (let i = 0; i < SVERDRUP_RASTER.width; i++) {
				const idx = j * SVERDRUP_RASTER.width + i
				if (!index.ocean[idx]) continue
				const lon = i - 180
				if (
					lat >= ATLANTIC_HEAT_SOURCE_SOUTH_LAT_DEG &&
					lat <= ATLANTIC_HEAT_SOURCE_NORTH_LAT_DEG &&
					lon >= ATLANTIC_HEAT_SOURCE_WEST_LON_DEG &&
					lon <= ATLANTIC_HEAT_SOURCE_EAST_LON_DEG
				) {
					atlanticHeatSource[idx] = 1
					sourceAreaM2 += rowCellAreaM2
				}
				if (
					lat >= ATLANTIC_HEAT_SINK_SOUTH_LAT_DEG &&
					lat <= ATLANTIC_HEAT_SINK_NORTH_LAT_DEG &&
					lon >= ATLANTIC_HEAT_SINK_WEST_LON_DEG &&
					lon <= ATLANTIC_HEAT_SINK_EAST_LON_DEG
				) {
					atlanticHeatSink[idx] = 1
					sinkAreaM2 += rowCellAreaM2
				}
			}
		}
		if (sourceAreaM2 <= 0 || sinkAreaM2 <= 0)
			throw new Error("Atlantic overturning heat regions contain no ocean")
		for (
			let j = ATLANTIC_OVERTURNING_SOUTH_LAT_DEG + 90;
			j <= ATLANTIC_OVERTURNING_NORTH_LAT_DEG + 90;
			j++
		) {
			let widthM = 0
			for (
				let i = ATLANTIC_OVERTURNING_WEST_LON_DEG + 180;
				i <= ATLANTIC_OVERTURNING_EAST_LON_DEG + 180;
				i++
			) {
				const idx = j * SVERDRUP_RASTER.width + i
				if (index.ocean[idx]) widthM += metersPerDeg * SVERDRUP_RASTER.rowCos[j]
			}
			if (widthM <= 0) continue
			const transportPerWidth = ATLANTIC_OVERTURNING_M3_S / widthM
			for (
				let i = ATLANTIC_OVERTURNING_WEST_LON_DEG + 180;
				i <= ATLANTIC_OVERTURNING_EAST_LON_DEG + 180;
				i++
			) {
				const idx = j * SVERDRUP_RASTER.width + i
				if (index.ocean[idx]) atlanticTransport.y[idx] = transportPerWidth
			}
		}
		for (let month = 0; month < MONTHS; month++) {
			const temperature = world.climate.temperature_monthly.subarray(
				month * N,
				(month + 1) * N,
			)

			// Converge the same two-pass fixed point the production model uses,
			// on the combined (both-terms) anomaly, so the flow this decomposes
			// is the actual flow the model ships -- not a flow that never saw
			// feedback.
			let circulation = SVERDRUP_CIRCULATION.surface({
				index,
				tau: monthlyTau[month],
				psi: seasonal.monthlyPsi[month],
				planet,
				sstAnomaly: null,
			})
			let combinedAnomaly = SVERDRUP_SST_ANOMALY.solve({
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
					sstAnomaly: combinedAnomaly,
				})
				combinedAnomaly = SVERDRUP_SST_ANOMALY.solve({
					index,
					circulation,
					temperature,
					isOcean,
					planet,
					upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
				})
			}

			// Decompose the converged month's own source and solve each term
			// alone. Each still gets removeZonalMean applied, to match what
			// solve() reports and what the OISST anomaly is itself defined against.
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
			const both = new Float32Array(CELLS)
			for (let i = 0; i < CELLS; i++) both[i] = advective[i] + vertical[i]
			const heatTransportM3CPerS =
				NORTH_ATLANTIC_HEAT_CONVERGENCE_W /
				(MIXED_LAYER.seawaterDensityKgM3 * MIXED_LAYER.seawaterHeatCapacityJKgK)
			const sourceCoolingCPerS =
				heatTransportM3CPerS / (MIXED_LAYER.depthM * sourceAreaM2)
			const sinkWarmingCPerS =
				heatTransportM3CPerS / (MIXED_LAYER.depthM * sinkAreaM2)
			const overturningHeatSource = both.slice()
			for (let idx = 0; idx < CELLS; idx++) {
				if (atlanticHeatSource[idx])
					overturningHeatSource[idx] -= sourceCoolingCPerS
				if (atlanticHeatSink[idx])
					overturningHeatSource[idx] += sinkWarmingCPerS
			}

			const relaxationSeconds = new Float32Array(CELLS).fill(
				MIXED_LAYER.relaxationSeconds,
			)
			const advAnomaly = SVERDRUP_SST_ANOMALY.solveAnomaly({
				flow: circulation.flow,
				ocean: index.ocean,
				source: advective,
				planet,
				relaxationSeconds,
			})
			const vertAnomaly = SVERDRUP_SST_ANOMALY.solveAnomaly({
				flow: circulation.flow,
				ocean: index.ocean,
				source: vertical,
				planet,
				relaxationSeconds,
			})
			const bothAnomaly = SVERDRUP_SST_ANOMALY.solveAnomaly({
				flow: circulation.flow,
				ocean: index.ocean,
				source: both,
				planet,
				relaxationSeconds,
			})
			const overturningHeatAnomaly = SVERDRUP_SST_ANOMALY.solveAnomaly({
				flow: circulation.flow,
				ocean: index.ocean,
				source: overturningHeatSource,
				planet,
				relaxationSeconds,
			})
			SVERDRUP_SST_ANOMALY.removeZonalMean({
				field: advAnomaly,
				ocean: index.ocean,
			})
			SVERDRUP_SST_ANOMALY.removeZonalMean({
				field: vertAnomaly,
				ocean: index.ocean,
			})
			SVERDRUP_SST_ANOMALY.removeZonalMean({
				field: bothAnomaly,
				ocean: index.ocean,
			})
			SVERDRUP_SST_ANOMALY.removeZonalMean({
				field: overturningHeatAnomaly,
				ocean: index.ocean,
			})
			const fixedTransportAnomaly = SVERDRUP_HEAT_TRANSPORT.solve({
				index,
				circulation,
				psi: seasonal.monthlyPsi[month],
				additionalTransport: zeroTransport,
				temperature,
				isOcean,
				planet,
				layerDepthM: fixedLayerDepthM,
				upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
			})
			const thermoclineLayerDepthM = new Float32Array(CELLS)
			for (let idx = 0; idx < CELLS; idx++)
				thermoclineLayerDepthM[idx] = Math.max(
					THERMOCLINE.easternDepthM,
					circulation.thermoclineDepth[idx],
				)
			const thermoclineTransportAnomaly = SVERDRUP_HEAT_TRANSPORT.solve({
				index,
				circulation,
				psi: seasonal.monthlyPsi[month],
				additionalTransport: zeroTransport,
				temperature,
				isOcean,
				planet,
				layerDepthM: thermoclineLayerDepthM,
				upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
			})
			const overturningTransportAnomaly = SVERDRUP_HEAT_TRANSPORT.solve({
				index,
				circulation,
				psi: seasonal.monthlyPsi[month],
				additionalTransport: atlanticTransport,
				temperature,
				isOcean,
				planet,
				layerDepthM: fixedLayerDepthM,
				upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
			})

			const sampleOcean = (field: Float32Array) =>
				SVERDRUP_RASTER.sample({
					field,
					mask: index.ocean,
					latDeg,
					lonDeg,
					include: isOcean,
				})
			const monthAdv = sampleOcean(advAnomaly)
			const monthVert = sampleOcean(vertAnomaly)
			const monthBoth = sampleOcean(bothAnomaly)
			const monthFixedTransport = sampleOcean(fixedTransportAnomaly)
			const monthThermoclineTransport = sampleOcean(thermoclineTransportAnomaly)
			const monthOverturningTransport = sampleOcean(overturningTransportAnomaly)
			const monthOverturningHeat = sampleOcean(overturningHeatAnomaly)
			for (let r = 0; r < N; r++) {
				advSstC[r] += monthAdv[r] / MONTHS
				vertSstC[r] += monthVert[r] / MONTHS
				bothSstC[r] += monthBoth[r] / MONTHS
				fixedTransportSstC[r] += monthFixedTransport[r] / MONTHS
				thermoclineTransportSstC[r] += monthThermoclineTransport[r] / MONTHS
				overturningTransportSstC[r] += monthOverturningTransport[r] / MONTHS
				overturningHeatSstC[r] += monthOverturningHeat[r] / MONTHS
			}
		}

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
		const obsSst = annualMean(observed.real_sst_anomaly_monthly)
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

		for (const box of BOXES) {
			const regions = regionsIn(box)
			console.log(
				`SSTSRC ${box.name.padEnd(17)} ` +
					`adv=${mean(regions.map((r) => advSstC[r])).toFixed(2)} ` +
					`vert=${mean(regions.map((r) => vertSstC[r])).toFixed(2)} ` +
					`both=${mean(regions.map((r) => bothSstC[r])).toFixed(2)} ` +
					`transport100=${mean(regions.map((r) => fixedTransportSstC[r])).toFixed(2)} ` +
					`transportH=${mean(regions.map((r) => thermoclineTransportSstC[r])).toFixed(2)} ` +
					`transportAMOC=${mean(regions.map((r) => overturningTransportSstC[r])).toFixed(2)} ` +
					`heatAMOC=${mean(regions.map((r) => overturningHeatSstC[r])).toFixed(2)} ` +
					`real=${mean(regions.map((r) => obsSst[r])).toFixed(2)}`,
			)
		}

		const midLatitudes: number[] = []
		for (let r = 0; r < N; r++) {
			if (world.isLand[r] || !Number.isFinite(obsSst[r])) continue
			const absLat = Math.abs(latDeg[r])
			if (absLat >= 15 && absLat <= 60) midLatitudes.push(r)
		}
		const correlation = (model: Float32Array) => {
			const modelMean = mean(midLatitudes.map((r) => model[r]))
			const observedMean = mean(midLatitudes.map((r) => obsSst[r]))
			let cov = 0
			let varModel = 0
			let varObserved = 0
			for (const r of midLatitudes) {
				cov += (model[r] - modelMean) * (obsSst[r] - observedMean)
				varModel += (model[r] - modelMean) ** 2
				varObserved += (obsSst[r] - observedMean) ** 2
			}
			return cov / Math.sqrt(varModel * varObserved)
		}
		console.log(
			`SSTSRC global 15-60 sst r adv=${correlation(advSstC).toFixed(2)} ` +
				`vert=${correlation(vertSstC).toFixed(2)} ` +
				`both=${correlation(bothSstC).toFixed(2)} ` +
				`transport100=${correlation(fixedTransportSstC).toFixed(2)} ` +
				`transportH=${correlation(thermoclineTransportSstC).toFixed(2)} ` +
				`transportAMOC=${correlation(overturningTransportSstC).toFixed(2)} ` +
				`heatAMOC=${correlation(overturningHeatSstC).toFixed(2)}`,
		)

		expect(midLatitudes.length).toBeGreaterThan(0)
	})
}, 600_000)
