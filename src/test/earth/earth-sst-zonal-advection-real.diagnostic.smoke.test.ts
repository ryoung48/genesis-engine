import { describe, expect, it } from "vitest"
import { SVERDRUP_CIRCULATION } from "@/model/climate/ocean/currents/sverdrup/circulation"
import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import { SVERDRUP_SST_ANOMALY } from "@/model/climate/ocean/currents/sverdrup/sst-anomaly"
import { STOMMEL } from "@/model/climate/ocean/currents/sverdrup/stommel"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { SAMPLING } from "@/model/pipelines/import-heightmap/sampling"
import { UNITS } from "@/model/shared/units"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// DIAGNOSTIC ONLY -- asserts nothing about accuracy, and nothing here gates a
// build. earth-sst-zonal-advection found that pairing u with a genuine 2D
// background gradient (instead of production's meridional-only, zonal-mean
// term) moves Kuroshio's error in the right direction (0.63 -> 0.35 toward
// its true near-zero value) without fixing it, and does about as much harm as
// good everywhere else (global r 0.32 -> 0.29). That test's background field
// was still the EBM's own modeled temperature, though -- so it couldn't tell
// apart "the zonal mechanism is missing" from "the mechanism exists but the
// EBM's zonal (east-west) temperature structure isn't accurate enough to
// drive it usefully" (the meridional case was insensitive to the EBM's known
// ocean bias only because a derivative is blind to a broad offset; that
// argument doesn't transfer to a real east-west contrast, which the EBM was
// never validated against). This substitutes real OISST monthly-mean SST for
// the background field feeding backgroundGradient, holding the mechanism
// (full u.grad(T) advection) and everything else fixed, to separate those two
// possibilities.
//
// Same configuration as the other current diagnostics: observed NCEP wind,
// the two-pass baroclinic fixed point sverdrup/index.ts ships with, real
// GODAS/OISST compared against but never fed in.

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
// Mirrors FEEDBACK_PASSES in sverdrup/index.ts -- reimplements the per-month
// solve loop by hand to get at intermediate fields, so it has to replicate
// the same fixed-point iteration.
const FEEDBACK_PASSES = 2

describe("SST-anomaly zonal-advection term against real background (diagnostic)", () => {
	it("reports meridional vs full-EBM vs full-real advection per region", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const currentU = loadEarthMonthlyRaster("earth-real-current-u")
		const currentV = loadEarthMonthlyRaster("earth-real-current-v")
		const sstAnomaly = loadEarthMonthlyRaster("earth-real-sst-anomaly")
		const realSst = loadEarthMonthlyRaster("earth-real-sst")
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
		const realSstArea = realSst.width * realSst.height
		const meridionalSstC = new Float32Array(N)
		const fullEbmSstC = new Float32Array(N)
		const fullRealSstC = new Float32Array(N)
		for (let month = 0; month < MONTHS; month++) {
			const modeledTemperature = world.climate.temperature_monthly.subarray(
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
			let meridionalAnomaly = SVERDRUP_SST_ANOMALY.solve({
				index,
				circulation,
				temperature: modeledTemperature,
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
					sstAnomaly: meridionalAnomaly,
				})
				meridionalAnomaly = SVERDRUP_SST_ANOMALY.solve({
					index,
					circulation,
					temperature: modeledTemperature,
					isOcean,
					planet,
					upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
				})
			}

			const { vertical } = SVERDRUP_SST_ANOMALY.heatSource({
				circulation,
				ocean: index.ocean,
				temperatureGradient: new Float64Array(SVERDRUP_RASTER.height),
				upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
			})

			const solveFullAdvection = (temperature: Float32Array) => {
				const gradient = SVERDRUP_SST_ANOMALY.backgroundGradient({
					index,
					temperature,
					isOcean,
					planet,
				})
				const source = new Float32Array(CELLS)
				for (let i = 0; i < CELLS; i++)
					source[i] =
						-(
							circulation.flow.x[i] * gradient.x[i] +
							circulation.flow.y[i] * gradient.y[i]
						) + vertical[i]
				const anomaly = SVERDRUP_SST_ANOMALY.solveAnomaly({
					flow: circulation.flow,
					ocean: index.ocean,
					source,
					planet,
					relaxationSeconds: new Float32Array(CELLS).fill(
						MIXED_LAYER.relaxationSeconds,
					),
				})
				SVERDRUP_SST_ANOMALY.removeZonalMean({
					field: anomaly,
					ocean: index.ocean,
				})
				return anomaly
			}

			const fullEbmAnomaly = solveFullAdvection(modeledTemperature)

			// Real OISST SST, bilinear-sampled onto mesh regions the same way the
			// pipeline samples every other real-Earth raster, falling back to the
			// modeled value at the rare NaN gap.
			const realSstMonth = SAMPLING.sampleSingleBandFloatRaster({
				mesh: world.mesh,
				raster: realSst.monthly.subarray(
					month * realSstArea,
					(month + 1) * realSstArea,
				),
				rasterW: realSst.width,
				rasterH: realSst.height,
				scale: realSst.scale,
				nodata: realSst.nodata,
			})
			const realTemperature = new Float32Array(N)
			for (let r = 0; r < N; r++)
				realTemperature[r] = Number.isFinite(realSstMonth[r])
					? realSstMonth[r]
					: modeledTemperature[r]
			const fullRealAnomaly = solveFullAdvection(realTemperature)

			const sampleOcean = (field: Float32Array) =>
				SVERDRUP_RASTER.sample({
					field,
					mask: index.ocean,
					latDeg,
					lonDeg,
					include: isOcean,
				})
			const monthMeridional = sampleOcean(meridionalAnomaly)
			const monthFullEbm = sampleOcean(fullEbmAnomaly)
			const monthFullReal = sampleOcean(fullRealAnomaly)
			for (let r = 0; r < N; r++) {
				meridionalSstC[r] += monthMeridional[r] / MONTHS
				fullEbmSstC[r] += monthFullEbm[r] / MONTHS
				fullRealSstC[r] += monthFullReal[r] / MONTHS
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
				`SSTZONALR ${box.name.padEnd(17)} ` +
					`meridional=${mean(regions.map((r) => meridionalSstC[r])).toFixed(2)} ` +
					`fullEbm=${mean(regions.map((r) => fullEbmSstC[r])).toFixed(2)} ` +
					`fullReal=${mean(regions.map((r) => fullRealSstC[r])).toFixed(2)} ` +
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
			`SSTZONALR global 15-60 sst r meridional=${correlation(meridionalSstC).toFixed(2)} ` +
				`fullEbm=${correlation(fullEbmSstC).toFixed(2)} ` +
				`fullReal=${correlation(fullRealSstC).toFixed(2)}`,
		)

		expect(midLatitudes.length).toBeGreaterThan(0)
	})
}, 600_000)
