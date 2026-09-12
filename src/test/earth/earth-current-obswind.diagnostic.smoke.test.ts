import { describe, expect, it } from "vitest"
import { OCEAN_CURRENTS } from "@/model/climate/ocean/currents"
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
import { UNITS } from "@/model/shared/units"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// DIAGNOSTIC ONLY -- asserts nothing about accuracy, and nothing here gates a
// build. It drives the ocean solver with observed NCEP winds so ocean error
// can be separated from the wind error feeding it; the shipping model and
// every committed floor run on procedural winds
// (earth-real-current-compare.smoke.test.ts). Tuning ocean physics against
// procedural winds is how the old fixed 100 m transport depth came to cancel
// a ~2x wind-stress deficit instead of being right.
//
// `obs` drives the solver with observed wind, `proc` is the shipping
// procedural field, `real` is GODAS/OISST. Ocean physics is doing its job when
// the `obs` column is good; the obs-to-proc gap is the wind model's backlog.

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

const MIN_OBSERVED_SPEED_MS = 0.02
const BAND_DEG = 10
const MIN_BAND_CELLS = 50
const MONTHS = 12

type Band = {
	num: number
	den: number
	modelSpeed: number
	observedSpeed: number
	speedCount: number
	sstAbsError: number
	sstBias: number
	sstCount: number
}

const emptyBand = (): Band => ({
	num: 0,
	den: 0,
	modelSpeed: 0,
	observedSpeed: 0,
	speedCount: 0,
	sstAbsError: 0,
	sstBias: 0,
	sstCount: 0,
})

describe("ocean currents driven by observed wind (diagnostic)", () => {
	it("reports the wind/ocean error split", () => {
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
		const procedural = world.oceanCurrents
		if (!observed?.real_u_monthly || !observed.real_v_monthly || !procedural)
			throw new Error("Earth import is missing ocean-current data")

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

		const flowU = new Float32Array(N)
		const flowV = new Float32Array(N)
		const sstC = new Float32Array(N)
		const operator = STOMMEL.build({ ocean: index.ocean, planet })
		console.log(`OBSW unknowns=${operator.count}`)
		const startedMs = Date.now()
		const monthlyTau = []
		const monthlyCurl = []
		for (let month = 0; month < MONTHS; month++) {
			const forcing = SVERDRUP_CIRCULATION.forcing({
				index,
				wind: WIND.observedWindVectorsForMonth({
					observedWind: world.observedWind,
					numRegions: N,
					month,
				}),
				planet,
			})
			monthlyTau.push(forcing.tau)
			monthlyCurl.push(forcing.curl)
		}
		const seasonal = STOMMEL.solveSeasonal({ operator, monthlyCurl, planet })
		console.log(
			`OBSW seasonal solves=${seasonal.solves} iterations=${seasonal.iterations}`,
		)
		for (let month = 0; month < MONTHS; month++) {
			const circulation = SVERDRUP_CIRCULATION.surface({
				index,
				tau: monthlyTau[month],
				psi: seasonal.monthlyPsi[month],
				planet,
			})
			const anomaly = SVERDRUP_SST_ANOMALY.solve({
				index,
				circulation,
				temperature: world.climate.temperature_monthly.subarray(
					month * N,
					(month + 1) * N,
				),
				isOcean,
				planet,
			})
			const sampleOcean = (field: Float32Array) =>
				SVERDRUP_RASTER.sample({
					field,
					mask: index.ocean,
					latDeg,
					lonDeg,
					include: isOcean,
				})
			const monthU = sampleOcean(circulation.flow.x)
			const monthV = sampleOcean(circulation.flow.y)
			const monthSst = sampleOcean(anomaly)
			for (let r = 0; r < N; r++) {
				flowU[r] += monthU[r] / MONTHS
				flowV[r] += monthV[r] / MONTHS
				sstC[r] += monthSst[r] / MONTHS
			}
		}
		console.log(`OBSW solve ms=${Date.now() - startedMs} (12 months)`)

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
		const obsU = annualMean(observed.real_u_monthly)
		const obsV = annualMean(observed.real_v_monthly)
		const obsSst = annualMean(observed.real_sst_anomaly_monthly)
		const procSst = procedural.sst.map(
			(value) => value * OCEAN_CURRENTS.sstAnomalySaturationC,
		)
		const mean = (values: number[]) =>
			values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)

		const regionsIn = (box: Box) => {
			const regions: number[] = []
			for (let r = 0; r < N; r++) {
				if (world.isLand[r]) continue
				if (latDeg[r] < box.lat[0] || latDeg[r] > box.lat[1]) continue
				if (lonDeg[r] < box.lon[0] || lonDeg[r] > box.lon[1]) continue
				if (!Number.isFinite(obsU[r]) || !Number.isFinite(obsV[r])) continue
				regions.push(r)
			}
			return regions
		}
		const directionSkill = (
			regions: number[],
			u: Float32Array,
			v: Float32Array,
		) => {
			let num = 0
			let den = 0
			for (const r of regions) {
				const observedSpeed = Math.hypot(obsU[r], obsV[r])
				const modelSpeed = Math.hypot(u[r], v[r])
				if (observedSpeed < MIN_OBSERVED_SPEED_MS || modelSpeed < 1e-9) continue
				num += (u[r] * obsU[r] + v[r] * obsV[r]) / modelSpeed
				den += observedSpeed
			}
			return den > 0 ? num / den : Number.NaN
		}

		for (const box of BOXES) {
			const regions = regionsIn(box)
			const withSst = regions.filter((r) => Number.isFinite(obsSst[r]))
			const speed = (u: Float32Array, v: Float32Array) =>
				mean(regions.map((r) => Math.hypot(u[r], v[r])))
			console.log(
				`OBSW ${box.name.padEnd(17)} ` +
					`skill obs=${directionSkill(regions, flowU, flowV).toFixed(2)} proc=${directionSkill(regions, procedural.flowU, procedural.flowV).toFixed(2)} | ` +
					`speed obs=${speed(flowU, flowV).toFixed(3)} proc=${speed(procedural.flowU, procedural.flowV).toFixed(3)} real=${speed(obsU, obsV).toFixed(3)} | ` +
					`sst obs=${mean(withSst.map((r) => sstC[r])).toFixed(2)} proc=${mean(withSst.map((r) => procSst[r])).toFixed(2)} real=${mean(withSst.map((r) => obsSst[r])).toFixed(2)}`,
			)
		}

		const bandsFor = (
			u: Float32Array,
			v: Float32Array,
			sst: Float32Array | number[],
		) => {
			const bands = new Map<number, Band>()
			for (let r = 0; r < N; r++) {
				if (world.isLand[r]) continue
				if (!Number.isFinite(obsU[r]) || !Number.isFinite(obsV[r])) continue
				const key = Math.floor(latDeg[r] / BAND_DEG) * BAND_DEG
				let band = bands.get(key)
				if (!band) {
					band = emptyBand()
					bands.set(key, band)
				}
				const observedSpeed = Math.hypot(obsU[r], obsV[r])
				const modelSpeed = Math.hypot(u[r], v[r])
				if (observedSpeed >= MIN_OBSERVED_SPEED_MS && modelSpeed >= 1e-9) {
					band.num += (u[r] * obsU[r] + v[r] * obsV[r]) / modelSpeed
					band.den += observedSpeed
					band.modelSpeed += modelSpeed
					band.observedSpeed += observedSpeed
					band.speedCount++
				}
				if (Number.isFinite(obsSst[r])) {
					band.sstAbsError += Math.abs(sst[r] - obsSst[r])
					band.sstBias += sst[r] - obsSst[r]
					band.sstCount++
				}
			}
			return bands
		}
		const obsBands = bandsFor(flowU, flowV, sstC)
		const procBands = bandsFor(procedural.flowU, procedural.flowV, procSst)

		console.log(
			"OBSWBAND  lat      n | dir obs  proc | ratio obs proc | sstMAE obs proc",
		)
		for (const key of [...obsBands.keys()].sort((a, b) => b - a)) {
			const o = obsBands.get(key)
			const p = procBands.get(key)
			if (!o || !p || o.speedCount < MIN_BAND_CELLS) continue
			const ratio = (band: Band) =>
				band.modelSpeed / Math.max(1e-9, band.observedSpeed)
			const dir = (band: Band) =>
				band.den > 0 ? band.num / band.den : Number.NaN
			const mae = (band: Band) => band.sstAbsError / Math.max(1, band.sstCount)
			console.log(
				`OBSWBAND ${String(key).padStart(4)} ${String(o.speedCount).padStart(6)} | ` +
					`${dir(o).toFixed(2).padStart(7)} ${dir(p).toFixed(2).padStart(5)} | ` +
					`${ratio(o).toFixed(2).padStart(9)} ${ratio(p).toFixed(2).padStart(4)} | ` +
					`${mae(o).toFixed(2).padStart(9)} ${mae(p).toFixed(2).padStart(4)}`,
			)
		}

		const midLatitudes: number[] = []
		for (let r = 0; r < N; r++) {
			if (world.isLand[r] || !Number.isFinite(obsU[r])) continue
			const absLat = Math.abs(latDeg[r])
			if (absLat >= 15 && absLat <= 60) midLatitudes.push(r)
		}
		const correlation = (model: Float32Array | number[]) => {
			const pairs = midLatitudes.filter((r) => Number.isFinite(obsSst[r]))
			const modelMean = mean(pairs.map((r) => model[r]))
			const observedMean = mean(pairs.map((r) => obsSst[r]))
			let cov = 0
			let varModel = 0
			let varObserved = 0
			for (const r of pairs) {
				cov += (model[r] - modelMean) * (obsSst[r] - observedMean)
				varModel += (model[r] - modelMean) ** 2
				varObserved += (obsSst[r] - observedMean) ** 2
			}
			return cov / Math.sqrt(varModel * varObserved)
		}
		console.log(
			`OBSW global 15-60 skill obs=${directionSkill(midLatitudes, flowU, flowV).toFixed(2)} ` +
				`proc=${directionSkill(midLatitudes, procedural.flowU, procedural.flowV).toFixed(2)} | ` +
				`sst r obs=${correlation(sstC).toFixed(2)} proc=${correlation(procSst).toFixed(2)}`,
		)

		expect(midLatitudes.length).toBeGreaterThan(0)
	})
}, 600_000)
