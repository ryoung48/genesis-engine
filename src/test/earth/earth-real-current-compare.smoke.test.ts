import { describe, expect, it } from "vitest"
import { OCEAN_CURRENTS } from "@/model/climate/ocean/currents"
import { RAIN } from "@/model/climate/precipitation/rain"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

type Box = {
	name: string
	lat: [number, number]
	lon: [number, number]
	sstSign: 1 | -1 | 0
}

const BOXES: Box[] = [
	{ name: "Gulf Stream", lat: [30, 42], lon: [-80, -55], sstSign: 1 },
	{ name: "Kuroshio", lat: [25, 40], lon: [122, 150], sstSign: 1 },
	{ name: "Brazil", lat: [-38, -20], lon: [-52, -38], sstSign: 1 },
	{ name: "Agulhas", lat: [-38, -25], lon: [25, 40], sstSign: 1 },
	{ name: "E Australian", lat: [-38, -25], lon: [150, 158], sstSign: 1 },
	{ name: "N Atlantic Drift", lat: [45, 55], lon: [-45, -15], sstSign: 1 },
	{ name: "California", lat: [22, 40], lon: [-130, -115], sstSign: -1 },
	{ name: "Canary", lat: [15, 32], lon: [-25, -12], sstSign: -1 },
	{ name: "Benguela", lat: [-32, -15], lon: [5, 15], sstSign: -1 },
	{ name: "Humboldt", lat: [-35, -10], lon: [-85, -72], sstSign: -1 },
	{ name: "N Eq Current Atl", lat: [10, 20], lon: [-55, -25], sstSign: 0 },
	{ name: "N Eq Current Pac", lat: [10, 20], lon: [150, 180], sstSign: 0 },
	{ name: "ACC 45-60S", lat: [-60, -45], lon: [-180, 180], sstSign: 0 },
]

const MIN_OBSERVED_SPEED_MS = 0.02

// Regression floors against the procedural winds, whose subtropical belt runs
// at 0.6-0.75 of observed speed (0.4-0.55 in stress), which is what still
// holds eastern-boundary upwelling and every boundary-current speed down.
// Direction is what the ocean model itself controls, so that is what these
// hold; raise them as the wind model improves.
const MIN_POSITIVE_DIRECTION_REGIONS = 13
const MIN_GLOBAL_DIRECTION_SKILL = 0.5
const MIN_CORRECT_SST_SIGNS = 9

// Procedural surface currents and SST anomalies on the imported Earth,
// compared region by region against NOAA GODAS surface currents and OISST
// anomalies. Observations are only compared against, never fed in.
describe("Earth ocean currents vs GODAS/OISST", () => {
	it.skip("reproduces boundary-current directions and SST anomaly signs", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const currentU = loadEarthMonthlyRaster("earth-real-current-u")
		const currentV = loadEarthMonthlyRaster("earth-real-current-v")
		const sstAnomaly = loadEarthMonthlyRaster("earth-real-sst-anomaly")

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
		const currents = world.oceanCurrents
		if (!observed?.real_u_monthly || !observed.real_v_monthly || !currents)
			throw new Error("Earth import is missing ocean-current data")

		const annualMean = (monthly: Float32Array | undefined) => {
			const out = new Float32Array(N).fill(Number.NaN)
			if (!monthly) return out
			for (let r = 0; r < N; r++) {
				let sum = 0
				let count = 0
				for (let m = 0; m < 12; m++) {
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
		const sstC = currents.sst.map(
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
		const directionSkill = (regions: number[]) => {
			let num = 0
			let den = 0
			for (const r of regions) {
				const observedSpeed = Math.hypot(obsU[r], obsV[r])
				const modelSpeed = Math.hypot(currents.flowU[r], currents.flowV[r])
				if (observedSpeed < MIN_OBSERVED_SPEED_MS || modelSpeed < 1e-9) continue
				num +=
					(currents.flowU[r] * obsU[r] + currents.flowV[r] * obsV[r]) /
					modelSpeed
				den += observedSpeed
			}
			return den > 0 ? num / den : Number.NaN
		}

		const skill: Record<string, number> = {}
		const modelSst: Record<string, number> = {}
		for (const box of BOXES) {
			const regions = regionsIn(box)
			const withSst = regions.filter((r) => Number.isFinite(obsSst[r]))
			skill[box.name] = directionSkill(regions)
			modelSst[box.name] = mean(withSst.map((r) => sstC[r]))
			console.log(
				`CURRENT ${box.name.padEnd(18)} skill=${skill[box.name].toFixed(2)} ` +
					`u model=${mean(regions.map((r) => currents.flowU[r])).toFixed(3)} ` +
					`observed=${mean(regions.map((r) => obsU[r])).toFixed(3)} ` +
					`v model=${mean(regions.map((r) => currents.flowV[r])).toFixed(3)} ` +
					`observed=${mean(regions.map((r) => obsV[r])).toFixed(3)} ` +
					`peak model=${Math.max(0, ...regions.map((r) => Math.hypot(currents.flowU[r], currents.flowV[r]))).toFixed(2)} ` +
					`observed=${Math.max(0, ...regions.map((r) => Math.hypot(obsU[r], obsV[r]))).toFixed(2)} ` +
					`sst model=${modelSst[box.name].toFixed(2)}C ` +
					`observed=${mean(withSst.map((r) => obsSst[r])).toFixed(2)}C`,
			)
		}

		const midLatitudes: number[] = []
		for (let r = 0; r < N; r++) {
			if (world.isLand[r] || !Number.isFinite(obsU[r])) continue
			const absLat = Math.abs(latDeg[r])
			if (absLat >= 15 && absLat <= 60) midLatitudes.push(r)
		}
		const globalSkill = directionSkill(midLatitudes)
		const pairs = midLatitudes.filter((r) => Number.isFinite(obsSst[r]))
		const modelMean = mean(pairs.map((r) => sstC[r]))
		const observedMean = mean(pairs.map((r) => obsSst[r]))
		let cov = 0
		let varModel = 0
		let varObserved = 0
		for (const r of pairs) {
			cov += (sstC[r] - modelMean) * (obsSst[r] - observedMean)
			varModel += (sstC[r] - modelMean) ** 2
			varObserved += (obsSst[r] - observedMean) ** 2
		}
		const sstCorrelation = cov / Math.sqrt(varModel * varObserved)
		const correctSstSigns = BOXES.filter(
			(box) =>
				box.sstSign !== 0 && Math.sign(modelSst[box.name]) === box.sstSign,
		).length
		console.log(
			`CURRENT global 15-60 skill=${globalSkill.toFixed(2)} ` +
				`sst r=${sstCorrelation.toFixed(2)} correct sst signs=${correctSstSigns}`,
		)

		const positiveDirectionRegions = BOXES.filter(
			(box) => skill[box.name] > 0,
		).length
		expect(positiveDirectionRegions).toBeGreaterThanOrEqual(
			MIN_POSITIVE_DIRECTION_REGIONS,
		)
		expect(globalSkill).toBeGreaterThan(MIN_GLOBAL_DIRECTION_SKILL)
		expect(correctSstSigns).toBeGreaterThanOrEqual(MIN_CORRECT_SST_SIGNS)
	})
}, 600_000)
