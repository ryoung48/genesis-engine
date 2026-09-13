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
// build. The SST-anomaly solve advects water across a background meridional
// temperature gradient it reads from `climate.temperature_monthly` -- this
// world's own EBM output, never observed data, even in the other current/SST
// diagnostics. This test substitutes real OISST monthly-mean SST for that one
// input, holding the modeled flow, divergence and thermocline depth fixed, to
// see how much of the SST-anomaly error is upstream climate-model error
// rather than ocean-current-solve error.
//
// `model` here reproduces exactly the configuration earth-current-obswind
// reports as its SST ceiling (r ~ 0.40): observed NCEP wind, and the two-pass
// baroclinic fixed point (SVERDRUP_CIRCULATION.surface -> SST -> corrected
// flow -> corrected SST) sverdrup/index.ts actually ships with. An earlier
// version of this test used procedural wind and a single pass, which is a
// materially different, weaker baseline (r ~ -0.04, matching every obswind
// run's *procedural* column) -- that made its `model` number look far worse
// than the one quoted elsewhere for the current model, when the two were
// simply never testing the same configuration. Both `model` and `ceiling`
// below must be read against each other, not against a number from a test
// run under different wind or feedback settings.
//
// Caveat this doesn't resolve: `real` (OISST anomaly) is OISST minus its own
// zonal mean, and `ceiling` here uses that same zonal mean's gradient as the
// input -- the two are complementary, not the same quantity, so this isn't
// circular. But the real zonal mean itself already carries the ocean's own
// large-scale heat-transport signature (a warm western-boundary current and a
// cool eastern one at the same latitude don't cancel exactly). So a strong
// result says the EBM's background field is a worse approximation of the real
// background than the real background is of itself -- not that the anomaly
// physics is perfect given a current-free background, which isn't a thing
// that exists to test against.

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

describe("SST-anomaly solve driven by real OISST background gradient (diagnostic)", () => {
	it("reports the climate-model/heat-solve error split", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const realSst = loadEarthMonthlyRaster("earth-real-sst")
		const sstAnomaly = loadEarthMonthlyRaster("earth-real-sst-anomaly")
		const realWindU = loadEarthMonthlyRaster("earth-real-wind-u")
		const realWindV = loadEarthMonthlyRaster("earth-real-wind-v")
		// Not used below -- only loaded because attachObservedEarthCurrent (and
		// so observedCurrent.real_sst_anomaly_monthly) requires both present.
		const currentU = loadEarthMonthlyRaster("earth-real-current-u")
		const currentV = loadEarthMonthlyRaster("earth-real-current-v")

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

		const modelSstC = new Float32Array(N)
		const ceilingSstC = new Float32Array(N)
		const realSstArea = realSst.width * realSst.height
		for (let month = 0; month < MONTHS; month++) {
			const modeledTemperature = world.climate.temperature_monthly.subarray(
				month * N,
				(month + 1) * N,
			)

			// Real OISST SST, bilinear-sampled onto mesh regions the same way the
			// pipeline samples every other real-Earth raster. zonalGradient only
			// reads ocean cells, and only their zonal mean, so falling back to the
			// modeled value at the rare NaN gap (ice edge, coastal cell OISST has
			// no coverage for) barely perturbs that mean.
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
			const ceilingTemperature = new Float32Array(N)
			for (let r = 0; r < N; r++)
				ceilingTemperature[r] = Number.isFinite(realSstMonth[r])
					? realSstMonth[r]
					: modeledTemperature[r]

			let modelCirculation = SVERDRUP_CIRCULATION.surface({
				index,
				tau: monthlyTau[month],
				psi: seasonal.monthlyPsi[month],
				planet,
				sstAnomaly: null,
			})
			let modelAnomaly = SVERDRUP_SST_ANOMALY.solve({
				index,
				circulation: modelCirculation,
				temperature: modeledTemperature,
				isOcean,
				planet,
				upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
			})
			let ceilingCirculation = SVERDRUP_CIRCULATION.surface({
				index,
				tau: monthlyTau[month],
				psi: seasonal.monthlyPsi[month],
				planet,
				sstAnomaly: null,
			})
			let ceilingAnomaly = SVERDRUP_SST_ANOMALY.solve({
				index,
				circulation: ceilingCirculation,
				temperature: ceilingTemperature,
				isOcean,
				planet,
				upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
			})
			for (let pass = 1; pass < FEEDBACK_PASSES; pass++) {
				modelCirculation = SVERDRUP_CIRCULATION.surface({
					index,
					tau: monthlyTau[month],
					psi: seasonal.monthlyPsi[month],
					planet,
					sstAnomaly: modelAnomaly,
				})
				modelAnomaly = SVERDRUP_SST_ANOMALY.solve({
					index,
					circulation: modelCirculation,
					temperature: modeledTemperature,
					isOcean,
					planet,
					upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
				})
				ceilingCirculation = SVERDRUP_CIRCULATION.surface({
					index,
					tau: monthlyTau[month],
					psi: seasonal.monthlyPsi[month],
					planet,
					sstAnomaly: ceilingAnomaly,
				})
				ceilingAnomaly = SVERDRUP_SST_ANOMALY.solve({
					index,
					circulation: ceilingCirculation,
					temperature: ceilingTemperature,
					isOcean,
					planet,
					upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
				})
			}

			const sampleOcean = (field: Float32Array) =>
				SVERDRUP_RASTER.sample({
					field,
					mask: index.ocean,
					latDeg,
					lonDeg,
					include: isOcean,
				})
			const monthModel = sampleOcean(modelAnomaly)
			const monthCeiling = sampleOcean(ceilingAnomaly)
			for (let r = 0; r < N; r++) {
				modelSstC[r] += monthModel[r] / MONTHS
				ceilingSstC[r] += monthCeiling[r] / MONTHS
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
				`SSTGRAD ${box.name.padEnd(17)} ` +
					`model=${mean(regions.map((r) => modelSstC[r])).toFixed(2)} ` +
					`ceiling=${mean(regions.map((r) => ceilingSstC[r])).toFixed(2)} ` +
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
			`SSTGRAD global 15-60 sst r model=${correlation(modelSstC).toFixed(2)} ` +
				`ceiling=${correlation(ceilingSstC).toFixed(2)}`,
		)

		expect(midLatitudes.length).toBeGreaterThan(0)
	})
}, 600_000)
