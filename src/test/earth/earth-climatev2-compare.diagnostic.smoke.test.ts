import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import { CLIMATE_V2 } from "@/model/climatev2"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import type { ClimateV2Cells } from "@/model/climatev2/types"
import { setParams } from "@/model/climatev2/vendor/config.js"
import {
	classifyCell,
	KOPPEN_CLASSES,
} from "@/model/climatev2/vendor/koppen.js"
import { SAMPLING } from "@/model/pipelines/import-heightmap/sampling"
import type { GenesisWorld } from "@/model/pipelines/types"
import type { StageTiming } from "@/model/shared/timing/types"
import { loadEarthMonthlyRaster } from "./assets"
import { CLIMATE_EARTH } from "./fixtures/climate-earth"

const LAT_BANDS = [
	{ label: "60N–90N", lo: 60, hi: 90 },
	{ label: "30N–60N", lo: 30, hi: 60 },
	{ label: "0–30N", lo: 0, hi: 30 },
	{ label: "0–30S", lo: -30, hi: 0 },
	{ label: "30S–60S", lo: -60, hi: -30 },
	{ label: "60S–90S", lo: -90, hi: -60 },
]
const GROUPS = ["A", "B", "C", "D", "E"]
const ARCTIC_REGIONS = [
	{ label: "Alaska and Canada", lo: -170, hi: -75 },
	{ label: "Greenland", lo: -75, hi: -10 },
	{ label: "Europe and W Russia", lo: -10, hi: 60 },
	{ label: "W Siberia", lo: 60, hi: 120 },
	{ label: "E Siberia", lo: 120, hi: 180 },
]
// land regions for the Köppen breakdown: the first box holding a cell takes it
const KOPPEN_REGIONS = [
	{ label: "Greenland", lat: [59, 84], lon: [-75, -10] },
	{ label: "Alaska and N Canada", lat: [55, 84], lon: [-170, -50] },
	{ label: "W US and Canada", lat: [30, 55], lon: [-130, -100] },
	{ label: "E US and Canada", lat: [25, 55], lon: [-100, -50] },
	{ label: "Mexico and C America", lat: [7, 30], lon: [-120, -75] },
	{ label: "Amazon and N S America", lat: [-15, 13], lon: [-82, -34] },
	{ label: "S South America", lat: [-56, -15], lon: [-82, -34] },
	{ label: "Europe", lat: [35, 72], lon: [-12, 40] },
	{ label: "Sahara and Arabia", lat: [15, 35], lon: [-18, 60] },
	{ label: "Sahel and C Africa", lat: [0, 15], lon: [-18, 52] },
	{ label: "S and E Africa", lat: [-35, 0], lon: [8, 52] },
	{ label: "Tibet and Himalaya", lat: [27, 40], lon: [70, 105] },
	{ label: "C Asia and Mongolia", lat: [35, 55], lon: [40, 120] },
	{ label: "Siberia", lat: [55, 78], lon: [40, 180] },
	{ label: "South Asia", lat: [5, 27], lon: [60, 92] },
	{ label: "East Asia", lat: [20, 55], lon: [100, 145] },
	{ label: "SE Asia", lat: [-11, 20], lon: [92, 155] },
	{ label: "Australia", lat: [-45, -10], lon: [112, 155] },
	{ label: "Antarctica", lat: [-90, -60], lon: [-180, 180] },
] as const
const KOPPEN_HEIGHT_BINS_KM = [0.5, 1.5, 3, Infinity]
const SEASON_OF_MONTH = [
	"winter",
	"winter",
	"",
	"",
	"",
	"summer",
	"summer",
	"summer",
	"",
	"",
	"",
	"winter",
]

type CurrentBox = {
	name: string
	lat: [number, number]
	lon: [number, number]
	sstSign: number
}

const CURRENT_BOXES: CurrentBox[] = [
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
const MIN_OBSERVED_CURRENT_MS = 0.02
const STRONG_SST_ANOMALY_C = 1
const SEA_ICE_EXTENT_CONCENTRATION = 0.15
const PERMANENT_SNOW_SHARE = 0.95
const SEASONAL_SNOW_SHARE = 0.05
const OUR_ICE_MIN_MM = 1

function stageMs(params: { timings: StageTiming[]; stage: string }): number {
	let total = 0
	for (const t of params.timings) {
		if (t.Stage === params.stage) total += t.ms
		total += stageMs({ timings: t.children, stage: params.stage })
	}
	return total
}

function flattenTimings(timings: StageTiming[]): Record<string, number> {
	const out: Record<string, number> = {}
	for (const t of timings) {
		out[t.Stage] = Math.round((out[t.Stage] ?? 0) + t.ms)
		for (const [stage, ms] of Object.entries(flattenTimings(t.children)))
			out[`${t.Stage} › ${stage}`] = ms
	}
	return out
}

function scoreIce(params: { world: GenesisWorld; v2: ClimateV2Cells | null }) {
	const { world, v2 } = params
	const { mesh, isLand } = world
	const N = mesh.numRegions
	const areaKm2 = (r: number) =>
		mesh.regionArea[r] * world.params.planetRadiusKm ** 2
	const hemis = ["N", "S"].map((h) => ({
		h,
		seaMonthly: new Float64Array(12),
		seaEver: 0,
		seaAlways: 0,
		landPermanent: 0,
		landEver: 0,
	}))
	for (let r = 0; r < N; r++) {
		const hemi = hemis[mesh.r_xyz[3 * r + 2] >= 0 ? 0 : 1]
		const a = areaKm2(r)
		if (v2) {
			if (isLand[r]) {
				if (v2.diagnostics.snowIceShare[r] >= PERMANENT_SNOW_SHARE)
					hemi.landPermanent += a
				if (v2.diagnostics.snowIceShare[r] > SEASONAL_SNOW_SHARE)
					hemi.landEver += a
				continue
			}
			let months = 0
			for (let m = 0; m < 12; m++) {
				if (
					v2.diagnostics.seaIceMonthly[m * N + r] < SEA_ICE_EXTENT_CONCENTRATION
				)
					continue
				hemi.seaMonthly[m] += a
				months++
			}
			if (months > 0) hemi.seaEver += a
			if (months === 12) hemi.seaAlways += a
			continue
		}
		const ever = world.iceMaxMonthly[r] > OUR_ICE_MIN_MM
		const always = world.iceMinMonthly[r] > OUR_ICE_MIN_MM
		if (isLand[r]) {
			if (always) hemi.landPermanent += a
			if (ever) hemi.landEver += a
		} else {
			if (always) hemi.seaAlways += a
			if (ever) hemi.seaEver += a
		}
	}
	const mkm2 = (x: number) => Number((x / 1e6).toFixed(2))
	return Object.fromEntries(
		hemis.map((h) => [
			h.h,
			{
				seaIceMaxMonthMkm2: v2 ? mkm2(Math.max(...h.seaMonthly)) : null,
				seaIceMinMonthMkm2: v2 ? mkm2(Math.min(...h.seaMonthly)) : null,
				seaIceEverMkm2: mkm2(h.seaEver),
				seaIceAllYearMkm2: mkm2(h.seaAlways),
				landIcePermanentMkm2: mkm2(h.landPermanent),
				landSnowEverMkm2: mkm2(h.landEver),
			},
		]),
	)
}

// seas beside the lands whose seasons lean on them
const SEA_BOXES = [
	{ label: "Arabian Sea", lat: [8, 25], lon: [55, 75] },
	{ label: "Bay of Bengal", lat: [8, 22], lon: [80, 95] },
	{ label: "Gulf of Mexico", lat: [18, 30], lon: [-98, -82] },
	{ label: "E Pacific off Mexico", lat: [8, 22], lon: [-115, -95] },
	{ label: "Gulf of Guinea", lat: [-5, 5], lon: [-10, 10] },
	{ label: "Timor and Coral Seas", lat: [-20, -10], lon: [115, 155] },
	{ label: "Mozambique Channel", lat: [-25, -12], lon: [35, 45] },
	{ label: "NE Atlantic", lat: [40, 60], lon: [-30, -5] },
	{ label: "Mediterranean", lat: [31, 44], lon: [0, 35] },
] as const

function scoreSeaBoxes(world: GenesisWorld) {
	const { mesh, isLand, climate } = world
	const N = mesh.numRegions
	const sst = loadEarthMonthlyRaster("earth-real-sst")
	const sstArea = sst.width * sst.height
	const boxesOf = Array.from({ length: N }, (): number[] => [])
	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		const lat =
			(Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) * 180) /
			Math.PI
		const lon =
			(Math.atan2(mesh.r_xyz[3 * r + 1], mesh.r_xyz[3 * r]) * 180) / Math.PI
		SEA_BOXES.forEach((b, i) => {
			if (
				lat >= b.lat[0] &&
				lat < b.lat[1] &&
				lon >= b.lon[0] &&
				lon < b.lon[1]
			)
				boxesOf[r].push(i)
		})
	}
	const sums = SEA_BOXES.map(() => ({
		bias: new Float64Array(12),
		observed: new Float64Array(12),
		n: new Float64Array(12),
	}))
	for (let m = 0; m < 12; m++) {
		const realSea = SAMPLING.sampleSingleBandFloatRaster({
			mesh,
			raster: sst.monthly.subarray(m * sstArea, (m + 1) * sstArea),
			rasterW: sst.width,
			rasterH: sst.height,
			scale: sst.scale,
			nodata: sst.nodata,
		})
		for (let r = 0; r < N; r++) {
			if (!Number.isFinite(realSea[r])) continue
			for (const b of boxesOf[r]) {
				sums[b].bias[m] += climate.temperature_monthly[m * N + r] - realSea[r]
				sums[b].observed[m] += realSea[r]
				sums[b].n[m]++
			}
		}
	}
	return SEA_BOXES.map((b, i) => {
		const k = sums[i]
		const bias = Array.from(k.bias, (x, m) =>
			Number((x / Math.max(1, k.n[m])).toFixed(1)),
		)
		return {
			label: b.label,
			annualBiasC: Number((bias.reduce((a, x) => a + x, 0) / 12).toFixed(2)),
			monthlyBiasC: bias,
			observedC: Array.from(k.observed, (x, m) =>
				Number((x / Math.max(1, k.n[m])).toFixed(1)),
			),
		}
	})
}

function scoreLandSeaGap(world: GenesisWorld) {
	const { mesh, isLand, climate } = world
	const N = mesh.numRegions
	const sst = loadEarthMonthlyRaster("earth-real-sst")
	const sstArea = sst.width * sst.height
	const realLand = climate.real_temperature_monthly
	const lat = new Float64Array(N)
	for (let r = 0; r < N; r++)
		lat[r] =
			(Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) * 180) /
			Math.PI
	const bands = LAT_BANDS.map((b) => ({
		...b,
		model: new Float64Array(12),
		observed: new Float64Array(12),
	}))
	let absErr = 0
	let count = 0
	for (let m = 0; m < 12; m++) {
		const realSea = SAMPLING.sampleSingleBandFloatRaster({
			mesh,
			raster: sst.monthly.subarray(m * sstArea, (m + 1) * sstArea),
			rasterW: sst.width,
			rasterH: sst.height,
			scale: sst.scale,
			nodata: sst.nodata,
		})
		for (const band of bands) {
			let landModel = 0
			let landObs = 0
			let landArea = 0
			let seaModel = 0
			let seaObs = 0
			let seaArea = 0
			for (let r = 0; r < N; r++) {
				if (lat[r] < band.lo || lat[r] >= band.hi) continue
				const a = mesh.regionArea[r]
				const i = m * N + r
				if (isLand[r]) {
					if (!Number.isFinite(realLand[i])) continue
					landModel += a * climate.temperature_monthly[i]
					landObs += a * realLand[i]
					landArea += a
				} else {
					if (!Number.isFinite(realSea[r])) continue
					seaModel += a * climate.temperature_monthly[i]
					seaObs += a * realSea[r]
					seaArea += a
				}
			}
			if (!landArea || !seaArea) {
				band.model[m] = Number.NaN
				band.observed[m] = Number.NaN
				continue
			}
			band.model[m] = landModel / landArea - seaModel / seaArea
			band.observed[m] = landObs / landArea - seaObs / seaArea
			absErr += Math.abs(band.model[m] - band.observed[m])
			count++
		}
	}
	const round = (x: number) => Number(x.toFixed(2))
	return {
		meanAbsGapErrorC: round(absErr / count),
		bands: Object.fromEntries(
			bands.map((b) => [
				b.label,
				{
					janModel: round(b.model[0]),
					janObserved: round(b.observed[0]),
					julModel: round(b.model[6]),
					julObserved: round(b.observed[6]),
					annualModel: round(b.model.reduce((s, x) => s + x, 0) / 12),
					annualObserved: round(b.observed.reduce((s, x) => s + x, 0) / 12),
				},
			]),
		),
	}
}

function newWindAcc() {
	return {
		n: 0,
		vectorErr: 0,
		speedAbsErr: 0,
		modelSpeed: 0,
		observedSpeed: 0,
		cos: 0,
		within90: 0,
	}
}

function summarizeWind(acc: ReturnType<typeof newWindAcc>) {
	const d = Math.max(1, acc.n)
	return {
		samples: acc.n,
		meanVectorErrorMs: Number((acc.vectorErr / d).toFixed(3)),
		meanAbsSpeedErrorMs: Number((acc.speedAbsErr / d).toFixed(3)),
		speedRatio: Number((acc.modelSpeed / acc.observedSpeed).toFixed(3)),
		meanDirectionCos: Number((acc.cos / d).toFixed(3)),
		within90Pct: Number(((100 * acc.within90) / d).toFixed(1)),
	}
}

function computeV2Cells(world: GenesisWorld): ClimateV2Cells {
	return CLIMATE_V2.computeCellClimate({
		mesh: world.mesh,
		elevationKm: world.elevation_km,
		isLand: world.isLand,
		orbit: CLIMATEV2_ORBIT.fromParams(world.params),
		seed: world.params.seed,
		diagnostics: true,
	})
}

function annualMean(params: { monthly: Float32Array; N: number }) {
	const { monthly, N } = params
	const out = new Float32Array(N).fill(Number.NaN)
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

function scoreCurrentField(params: {
	world: GenesisWorld
	u: Float32Array
	v: Float32Array
	obsU: Float32Array
	obsV: Float32Array
}) {
	const { world, u, v, obsU, obsV } = params
	const N = world.mesh.numRegions
	const { latDeg, lonDeg } = RAIN.getClimateGeometry(world.mesh)
	const inBox = (box: CurrentBox, r: number) =>
		latDeg[r] >= box.lat[0] &&
		latDeg[r] <= box.lat[1] &&
		lonDeg[r] >= box.lon[0] &&
		lonDeg[r] <= box.lon[1]
	const boxes = CURRENT_BOXES.map((box) => ({ ...box, num: 0, den: 0 }))
	let num = 0
	let den = 0
	let n = 0
	let vectorErr = 0
	let modelSpeed = 0
	let observedSpeed = 0
	let within90 = 0
	for (let r = 0; r < N; r++) {
		if (world.isLand[r]) continue
		const os = Math.hypot(obsU[r], obsV[r])
		if (!Number.isFinite(os) || os < MIN_OBSERVED_CURRENT_MS) continue
		const ms = Math.hypot(u[r], v[r])
		n++
		vectorErr += Math.hypot(u[r] - obsU[r], v[r] - obsV[r])
		modelSpeed += ms
		observedSpeed += os
		if (ms < 1e-9) continue
		const along = (u[r] * obsU[r] + v[r] * obsV[r]) / ms
		if (along > 0) within90++
		num += along
		den += os
		for (const box of boxes) {
			if (!inBox(box, r)) continue
			box.num += along
			box.den += os
		}
	}
	const boxSkill = Object.fromEntries(
		boxes.map((b) => [
			b.name,
			b.den > 0 ? Number((b.num / b.den).toFixed(2)) : null,
		]),
	)
	return {
		cells: n,
		directionSkill: Number((num / den).toFixed(3)),
		within90Pct: Number(((100 * within90) / n).toFixed(1)),
		meanVectorErrorMs: Number((vectorErr / n).toFixed(3)),
		speedRatio: Number((modelSpeed / observedSpeed).toFixed(2)),
		positiveBoxes: boxes.filter((b) => b.den > 0 && b.num > 0).length,
		boxSkill,
	}
}

function scoreCurrents(params: {
	world: GenesisWorld
	engineCurrents: { name: string; u: Float32Array; v: Float32Array }
}) {
	const { world, engineCurrents } = params
	const N = world.mesh.numRegions
	const observed = world.observedCurrent
	expect(observed?.real_u_monthly).toBeDefined()
	const obsU = annualMean({ monthly: observed.real_u_monthly, N })
	const obsV = annualMean({ monthly: observed.real_v_monthly, N })
	const at = { world, obsU, obsV }
	const obsSst = annualMean({ monthly: observed.real_sst_anomaly_monthly, N })
	const seaTemperature = scoreSstAnomaly({
		world,
		obsSst,
		anomaly: zonalAnomaly({
			world,
			field: annualMean({ monthly: world.climate.temperature_monthly, N }),
		}),
	})
	return {
		[engineCurrents.name]: scoreCurrentField({
			...at,
			u: engineCurrents.u,
			v: engineCurrents.v,
		}),
		sstAnomaly: { [`${engineCurrents.name}SeaTemperature`]: seaTemperature },
	}
}

function zonalAnomaly(params: { world: GenesisWorld; field: Float32Array }) {
	const { world, field } = params
	const N = world.mesh.numRegions
	const { latDeg } = RAIN.getClimateGeometry(world.mesh)
	const sum = new Float64Array(180)
	const count = new Int32Array(180)
	const bin = (r: number) => Math.min(179, Math.floor(latDeg[r] + 90))
	for (let r = 0; r < N; r++) {
		if (world.isLand[r] || !Number.isFinite(field[r])) continue
		sum[bin(r)] += field[r]
		count[bin(r)]++
	}
	const out = new Float32Array(N).fill(Number.NaN)
	for (let r = 0; r < N; r++) {
		if (world.isLand[r] || !count[bin(r)]) continue
		out[r] = field[r] - sum[bin(r)] / count[bin(r)]
	}
	return out
}

function scoreSstAnomaly(params: {
	world: GenesisWorld
	anomaly: Float32Array
	obsSst: Float32Array
}) {
	const { world, anomaly, obsSst } = params
	const N = world.mesh.numRegions
	const { latDeg, lonDeg } = RAIN.getClimateGeometry(world.mesh)
	let n = 0
	let sm = 0
	let so = 0
	let smm = 0
	let soo = 0
	let smo = 0
	let absErr = 0
	let strong = 0
	let strongMatch = 0
	const boxes = CURRENT_BOXES.filter((b) => b.sstSign !== 0).map((b) => ({
		...b,
		model: 0,
		observed: 0,
		n: 0,
	}))
	for (let r = 0; r < N; r++) {
		if (world.isLand[r]) continue
		const m = anomaly[r]
		const o = obsSst[r]
		if (!Number.isFinite(m) || !Number.isFinite(o)) continue
		n++
		sm += m
		so += o
		smm += m * m
		soo += o * o
		smo += m * o
		absErr += Math.abs(m - o)
		if (Math.abs(o) >= STRONG_SST_ANOMALY_C) {
			strong++
			if (Math.sign(m) === Math.sign(o)) strongMatch++
		}
		for (const box of boxes) {
			if (
				latDeg[r] < box.lat[0] ||
				latDeg[r] > box.lat[1] ||
				lonDeg[r] < box.lon[0] ||
				lonDeg[r] > box.lon[1]
			)
				continue
			box.model += m
			box.observed += o
			box.n++
		}
	}
	const cov = smo / n - (sm / n) * (so / n)
	const sdM = Math.sqrt(smm / n - (sm / n) ** 2)
	const sdO = Math.sqrt(soo / n - (so / n) ** 2)
	return {
		cells: n,
		correlation: Number((cov / (sdM * sdO)).toFixed(3)),
		meanAbsErrorC: Number((absErr / n).toFixed(2)),
		modelSpreadC: Number(sdM.toFixed(2)),
		observedSpreadC: Number(sdO.toFixed(2)),
		strongSignMatchPct: Number(((100 * strongMatch) / strong).toFixed(1)),
		correctBoxSigns: boxes.filter(
			(b) => b.n > 0 && Math.sign(b.model) === b.sstSign,
		).length,
		boxes: Object.fromEntries(
			boxes.map((b) => [
				b.name,
				{
					modelC: Number((b.model / b.n).toFixed(2)),
					observedC: Number((b.observed / b.n).toFixed(2)),
				},
			]),
		),
	}
}

function scoreWind(params: {
	world: GenesisWorld
	monthlyWind: { source: string; u: Float32Array; v: Float32Array }
}) {
	const { world, monthlyWind } = params
	const { mesh, isLand } = world
	const N = mesh.numRegions
	const sea = newWindAcc()
	const land = newWindAcc()
	const seaBands = LAT_BANDS.map((b) => ({ ...b, acc: newWindAcc() }))
	for (let m = 0; m < 12; m++) {
		const obs = WIND.observedWindVectorsForMonth({
			observedWind: world.observedWind,
			numRegions: N,
			month: m,
		})
		for (let r = 0; r < N; r++) {
			const os = obs.windSpeed[r]
			if (!Number.isFinite(os) || os <= 1e-9) continue
			const ou = obs.windU[r] * os
			const ov = obs.windV[r] * os
			const mu = monthlyWind.u[m * N + r]
			const mv = monthlyWind.v[m * N + r]
			const ms = Math.hypot(mu, mv)
			const cos = ms > 1e-9 ? (mu * ou + mv * ov) / (ms * os) : 0
			const latDeg =
				(Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) * 180) /
				Math.PI
			const targets = isLand[r]
				? [land]
				: [
						sea,
						...seaBands
							.filter((b) => latDeg >= b.lo && latDeg < b.hi)
							.map((b) => b.acc),
					]
			for (const acc of targets) {
				acc.n++
				acc.vectorErr += Math.hypot(mu - ou, mv - ov)
				acc.speedAbsErr += Math.abs(ms - os)
				acc.modelSpeed += ms
				acc.observedSpeed += os
				acc.cos += cos
				if (cos > 0) acc.within90++
			}
		}
	}
	return {
		source: monthlyWind.source,
		sea: summarizeWind(sea),
		land: summarizeWind(land),
		seaBandVectorErrorMs: Object.fromEntries(
			seaBands.map((b) => [b.label, summarizeWind(b.acc).meanVectorErrorMs]),
		),
	}
}

// the year's first harmonic of a monthly series: its half-range (°C) and the month of its peak (0 = mid-January)
function annualHarmonic(months: number[]) {
	let re = 0
	let im = 0
	for (let m = 0; m < 12; m++) {
		re += months[m] * Math.cos((2 * Math.PI * m) / 12)
		im += months[m] * Math.sin((2 * Math.PI * m) / 12)
	}
	const peak = ((Math.atan2(im, re) * 6) / Math.PI + 12) % 12
	return {
		amplitudeC: Number(((2 * Math.hypot(re, im)) / 12).toFixed(2)),
		peakMonth: Number(peak.toFixed(2)),
	}
}

function score() {
	const startedAt = performance.now()
	const world = CLIMATE_EARTH.importWorld()
	const importMs = performance.now() - startedAt
	// (v2 again with its diagnostics on: the sea ice and snow the bench scores)
	const v2Cells = computeV2Cells(world)
	const monthlyWind = {
		source: "climatev2 circulation",
		u: v2Cells.windUMonthly,
		v: v2Cells.windVMonthly,
	}
	const engineCurrents = {
		name: "climatev2",
		u: v2Cells.oceanCurrents.flowU,
		v: v2Cells.oceanCurrents.flowV,
	}
	const { climate, rainfall, isLand, mesh } = world
	const N = mesh.numRegions
	const realT = climate.real_temperature_monthly
	const realP = rainfall.real_monthly
	expect(realT).toBeDefined()
	expect(realP).toBeDefined()
	const modelT = climate.temperature_monthly
	const modelP = rainfall.monthly

	let tMonthlyAbs = 0
	let tMonthlyN = 0
	let tAnnualAbs = 0
	let tAnnualBias = 0
	let tAnnualN = 0
	const bands = LAT_BANDS.map((b) => ({
		...b,
		abs: 0,
		n: 0,
		summer: 0,
		summerN: 0,
		winter: 0,
		winterN: 0,
	}))
	const rainBands = LAT_BANDS.map((b) => ({
		...b,
		abs: 0,
		bias: 0,
		obs: 0,
		n: 0,
	}))
	let pAnnualAbs = 0
	let pAnnualBias = 0
	let pMonthlyAbs = 0
	let pTooWet = 0
	let pTooDry = 0
	let pLogAbs = 0
	let pN = 0
	let kExact = 0
	let kMajor = 0
	let kN = 0
	const kShareModel = Object.fromEntries(GROUPS.map((g) => [g, 0]))
	const kShareObserved = Object.fromEntries(GROUPS.map((g) => [g, 0]))
	const kClasses = new Map<
		string,
		{ observed: number; model: number; hit: number }
	>()
	const kPairs = new Map<string, number>()
	const kSwaps = new Map<
		string,
		{
			n: number
			warmestModel: number
			warmestObserved: number
			heightKm: number
			bias: Float64Array
			regions: Map<string, number>
		}
	>()
	const kRegions = [...KOPPEN_REGIONS.map((k) => k.label), "other"].map(
		(label) => ({
			label,
			n: 0,
			exact: 0,
			major: 0,
			tBias: 0,
			pBias: 0,
			pObserved: 0,
			groupsObserved: Object.fromEntries(GROUPS.map((g) => [g, 0])),
			groupsModel: Object.fromEntries(GROUPS.map((g) => [g, 0])),
			misses: new Map<string, number>(),
			monthBias: new Float64Array(12),
			monthObserved: new Float64Array(12),
			rainModel: new Float64Array(12),
			rainObserved: new Float64Array(12),
			heights: KOPPEN_HEIGHT_BINS_KM.map(() => ({ n: 0, bias: 0 })),
		}),
	)
	const kCells: [number, number, string, string][] = []
	const kClass = (code: string) => {
		let c = kClasses.get(code)
		if (!c) {
			c = { observed: 0, model: 0, hit: 0 }
			kClasses.set(code, c)
		}
		return c
	}
	const arcticMonths = Array.from({ length: 12 }, () => ({ bias: 0, n: 0 }))
	const arcticRegions = ARCTIC_REGIONS.map((a) => ({
		...a,
		bias: 0,
		n: 0,
		model: new Float64Array(12),
		observed: new Float64Array(12),
		months: new Float64Array(12),
		rainModel: new Float64Array(12),
		rainObserved: new Float64Array(12),
		rainMonths: new Float64Array(12),
	}))
	const T12m = new Float64Array(12)
	const P12m = new Float64Array(12)
	const T12o = new Float64Array(12)
	const P12o = new Float64Array(12)

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		const latDeg =
			(Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) * 180) /
			Math.PI
		const lonDeg =
			(Math.atan2(mesh.r_xyz[3 * r + 1], mesh.r_xyz[3 * r]) * 180) / Math.PI
		const band = bands.find((b) => latDeg >= b.lo && latDeg < b.hi)
		const rainBand = rainBands.find((b) => latDeg >= b.lo && latDeg < b.hi)
		let tAll = true
		let pAll = true
		let tSumM = 0
		let tSumO = 0
		let pSumM = 0
		let pSumO = 0
		for (let m = 0; m < 12; m++) {
			const i = m * N + r
			T12m[m] = modelT[i]
			T12o[m] = realT[i]
			P12m[m] = modelP[i]
			P12o[m] = realP[i]
			if (Number.isFinite(realT[i])) {
				const e = Math.abs(modelT[i] - realT[i])
				tMonthlyAbs += e
				tMonthlyN++
				if (latDeg >= 60) {
					arcticMonths[m].bias += modelT[i] - realT[i]
					arcticMonths[m].n++
					const region = arcticRegions.find(
						(a) => lonDeg >= a.lo && lonDeg < a.hi,
					)
					if (region) {
						region.model[m] += modelT[i]
						region.observed[m] += realT[i]
						region.months[m]++
						if (Number.isFinite(realP[i])) {
							region.rainModel[m] += modelP[i]
							region.rainObserved[m] += realP[i]
							region.rainMonths[m]++
						}
						if (SEASON_OF_MONTH[m] === "winter") {
							region.bias += modelT[i] - realT[i]
							region.n++
						}
					}
				}
				if (band) {
					band.abs += e
					band.n++
					const season = SEASON_OF_MONTH[latDeg > 0 ? m : (m + 6) % 12]
					if (season === "summer") {
						band.summer += modelT[i] - realT[i]
						band.summerN++
					} else if (season === "winter") {
						band.winter += modelT[i] - realT[i]
						band.winterN++
					}
				}
			} else tAll = false
			if (!Number.isFinite(realP[i])) pAll = false
			tSumM += modelT[i]
			tSumO += realT[i]
			pSumM += modelP[i]
			pSumO += realP[i]
		}
		if (tAll) {
			tAnnualAbs += Math.abs(tSumM / 12 - tSumO / 12)
			tAnnualBias += tSumM / 12 - tSumO / 12
			tAnnualN++
		}
		if (pAll) {
			const d = pSumM - pSumO
			pAnnualAbs += Math.abs(d)
			pAnnualBias += d
			for (let m = 0; m < 12; m++) pMonthlyAbs += Math.abs(P12m[m] - P12o[m])
			if (d > 300) pTooWet++
			if (d < -300) pTooDry++
			pLogAbs += Math.abs(Math.log((pSumM + 50) / (pSumO + 50)))
			pN++
			if (rainBand) {
				rainBand.abs += Math.abs(d)
				rainBand.bias += d
				rainBand.obs += pSumO
				rainBand.n++
			}
		}
		if (tAll && pAll) {
			const codeM = KOPPEN_CLASSES[classifyCell(T12m, P12m)].code
			const codeO = KOPPEN_CLASSES[classifyCell(T12o, P12o)].code
			if (codeM === codeO) kExact++
			if (codeM[0] === codeO[0]) kMajor++
			kShareModel[codeM[0]]++
			kShareObserved[codeO[0]]++
			kClass(codeO).observed++
			kClass(codeM).model++
			if (codeM === codeO) kClass(codeO).hit++
			else {
				const pair = `${codeO}→${codeM}`
				kPairs.set(pair, (kPairs.get(pair) ?? 0) + 1)
			}
			const at = KOPPEN_REGIONS.findIndex(
				(k) =>
					latDeg >= k.lat[0] &&
					latDeg < k.lat[1] &&
					lonDeg >= k.lon[0] &&
					lonDeg < k.lon[1],
			)
			const region = kRegions[at < 0 ? kRegions.length - 1 : at]
			region.n++
			if (codeM === codeO) region.exact++
			if (codeM[0] === codeO[0]) region.major++
			region.tBias += (tSumM - tSumO) / 12
			for (let m = 0; m < 12; m++) {
				region.monthBias[m] += T12m[m] - T12o[m]
				region.monthObserved[m] += T12o[m]
				region.rainModel[m] += P12m[m]
				region.rainObserved[m] += P12o[m]
			}
			const height =
				region.heights[
					KOPPEN_HEIGHT_BINS_KM.findIndex(
						(top) => Math.max(0, world.elevation_km[r]) < top,
					)
				]
			height.n++
			height.bias += (tSumM - tSumO) / 12
			region.pBias += pSumM - pSumO
			region.pObserved += pSumO
			region.groupsObserved[codeO[0]]++
			region.groupsModel[codeM[0]]++
			if (codeM !== codeO) {
				const pair = `${codeO}→${codeM}`
				region.misses.set(pair, (region.misses.get(pair) ?? 0) + 1)
			}
			if (codeM !== codeO) {
				const pair = `${codeO}→${codeM}`
				let sw = kSwaps.get(pair)
				if (!sw) {
					sw = {
						n: 0,
						warmestModel: 0,
						warmestObserved: 0,
						heightKm: 0,
						bias: new Float64Array(12),
						regions: new Map(),
					}
					kSwaps.set(pair, sw)
				}
				sw.n++
				sw.warmestModel += Math.max(...T12m)
				sw.warmestObserved += Math.max(...T12o)
				sw.heightKm += Math.max(0, world.elevation_km[r])
				for (let m = 0; m < 12; m++) sw.bias[m] += T12m[m] - T12o[m]
				sw.regions.set(region.label, (sw.regions.get(region.label) ?? 0) + 1)
			}
			if (process.env.KOPPEN_CELLS) kCells.push([latDeg, lonDeg, codeO, codeM])
			kN++
		}
	}
	const pct = (x: number) => Number(((100 * x) / Math.max(1, kN)).toFixed(1))
	const climateMs = stageMs({
		timings: world.timings ?? [],
		stage: "Post: climate",
	})
	return {
		landCells: tAnnualN,
		temperature: {
			monthlyMaeC: Number((tMonthlyAbs / tMonthlyN).toFixed(3)),
			annualMaeC: Number((tAnnualAbs / tAnnualN).toFixed(3)),
			annualBiasC: Number((tAnnualBias / tAnnualN).toFixed(3)),
			bandMonthlyMaeC: Object.fromEntries(
				bands.map((b) => [b.label, Number((b.abs / b.n).toFixed(3))]),
			),
			bandSummerBiasC: Object.fromEntries(
				bands.map((b) => [b.label, Number((b.summer / b.summerN).toFixed(2))]),
			),
			bandWinterBiasC: Object.fromEntries(
				bands.map((b) => [b.label, Number((b.winter / b.winterN).toFixed(2))]),
			),
			arcticMonthlyBiasC: arcticMonths.map((a) =>
				Number((a.bias / a.n).toFixed(2)),
			),
			arcticWinterBiasC: Object.fromEntries(
				arcticRegions.map((a) => [
					a.label,
					{
						biasC: Number((a.bias / a.n).toFixed(2)),
						samples: a.n,
						modelC: Array.from(a.model, (v, m) =>
							Number((v / a.months[m]).toFixed(1)),
						),
						observedC: Array.from(a.observed, (v, m) =>
							Number((v / a.months[m]).toFixed(1)),
						),
					},
				]),
			),
		},
		rain: {
			arcticMonthlyMm: Object.fromEntries(
				arcticRegions.map((a) => [
					a.label,
					{
						modelMm: Array.from(a.rainModel, (v, m) =>
							Math.round(v / a.rainMonths[m]),
						),
						observedMm: Array.from(a.rainObserved, (v, m) =>
							Math.round(v / a.rainMonths[m]),
						),
					},
				]),
			),
			annualMaeMm: Number((pAnnualAbs / pN).toFixed(1)),
			annualBiasMm: Number((pAnnualBias / pN).toFixed(1)),
			monthlyMaeMm: Number((pMonthlyAbs / (12 * pN)).toFixed(1)),
			meanAbsLogRatio: Number((pLogAbs / pN).toFixed(3)),
			tooWetPct: Number(((100 * pTooWet) / pN).toFixed(1)),
			tooDryPct: Number(((100 * pTooDry) / pN).toFixed(1)),
			bands: Object.fromEntries(
				rainBands.map((b) => [
					b.label,
					{
						observedMm: Math.round(b.obs / b.n),
						maeMm: Math.round(b.abs / b.n),
						biasMm: Math.round(b.bias / b.n),
					},
				]),
			),
		},
		wind: scoreWind({ world, monthlyWind }),
		currents: scoreCurrents({ world, engineCurrents }),
		ice: scoreIce({ world, v2: v2Cells }),
		landSeaGap: scoreLandSeaGap(world),
		seaBoxes: scoreSeaBoxes(world),
		koppen: {
			cells: kN,
			exactPct: pct(kExact),
			majorPct: pct(kMajor),
			modelGroupPct: Object.fromEntries(
				GROUPS.map((g) => [g, pct(kShareModel[g])]),
			),
			observedGroupPct: Object.fromEntries(
				GROUPS.map((g) => [g, pct(kShareObserved[g])]),
			),
			classes: Object.fromEntries(
				[...kClasses]
					.sort((a, b) => b[1].observed - a[1].observed)
					.map(([code, c]) => [
						code,
						{
							observedPct: pct(c.observed),
							modelPct: pct(c.model),
							hitOfObservedPct: Number(
								((100 * c.hit) / Math.max(1, c.observed)).toFixed(1),
							),
							hitOfModelPct: Number(
								((100 * c.hit) / Math.max(1, c.model)).toFixed(1),
							),
						},
					]),
			),
			topMisses: [...kPairs]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 25)
				.map(([pair, n]) => ({ pair, pct: pct(n) })),
			regions: kRegions
				.filter((k) => k.n > 0)
				.map((k) => {
					const share = (x: number) => Number(((100 * x) / k.n).toFixed(1))
					return {
						label: k.label,
						landPct: pct(k.n),
						exactPct: share(k.exact),
						majorPct: share(k.major),
						missedLandPct: pct(k.n - k.exact),
						annualTBiasC: Number((k.tBias / k.n).toFixed(2)),
						rainBiasMm: Math.round(k.pBias / k.n),
						observedRainMm: Math.round(k.pObserved / k.n),
						observedGroupPct: Object.fromEntries(
							GROUPS.map((g) => [g, share(k.groupsObserved[g])]),
						),
						modelGroupPct: Object.fromEntries(
							GROUPS.map((g) => [g, share(k.groupsModel[g])]),
						),
						monthlyTBiasC: Array.from(k.monthBias, (b) =>
							Number((b / k.n).toFixed(1)),
						),
						monthlyRainMm: {
							model: Array.from(k.rainModel, (p) => Math.round(p / k.n)),
							observed: Array.from(k.rainObserved, (p) => Math.round(p / k.n)),
						},
						seasonModel: annualHarmonic(
							Array.from(k.monthObserved, (o, m) => (o + k.monthBias[m]) / k.n),
						),
						seasonObserved: annualHarmonic(
							Array.from(k.monthObserved, (o) => o / k.n),
						),
						tBiasByHeight: KOPPEN_HEIGHT_BINS_KM.map((top, i) => ({
							belowKm: top,
							landPct: share(k.heights[i].n),
							biasC: Number(
								(k.heights[i].bias / Math.max(1, k.heights[i].n)).toFixed(2),
							),
						})),
						topMisses: [...k.misses]
							.sort((a, b) => b[1] - a[1])
							.slice(0, 4)
							.map(([pair, n]) => ({ pair, pct: share(n) })),
					}
				}),
			cellCodes: process.env.KOPPEN_CELLS ? kCells : null,
			swapDetail: [...kSwaps]
				.sort((a, b) => b[1].n - a[1].n)
				.slice(0, 12)
				.map(([pair, sw]) => ({
					pair,
					landPct: pct(sw.n),
					warmestModelC: Number((sw.warmestModel / sw.n).toFixed(1)),
					warmestObservedC: Number((sw.warmestObserved / sw.n).toFixed(1)),
					heightKm: Number((sw.heightKm / sw.n).toFixed(2)),
					monthlyTBiasC: Array.from(sw.bias, (b) =>
						Number((b / sw.n).toFixed(1)),
					),
					regions: [...sw.regions]
						.sort((a, b) => b[1] - a[1])
						.slice(0, 4)
						.map(([label, n]) => `${label} ${Math.round((100 * n) / sw.n)}%`),
				})),
		},
		timing: {
			importMs: Math.round(importMs),
			climateStageMs: Math.round(climateMs),
			pipelineStagesMs: flattenTimings(world.timings ?? []),
			climatev2StagesMs: Object.fromEntries(
				v2Cells.timing.map((t) => [t.stage, Math.round(t.ms)]),
			),
		},
	}
}

describe("climate vs observed Earth (diagnostic)", () => {
	it("scores the climate on the imported Earth terrain", () => {
		if (process.env.CLIMATE_SEA_ICE === "0") setParams({ TEMP_SEA_ICE: 0 })
		const results = { v2: score() }
		const stamp = new Date().toISOString().replace(/[:.]/g, "-")
		const title = process.env.CLIMATE_BENCH_TITLE ?? "atlas-comparison"
		const outDir = path.join("stats", "climate", `${stamp}-${title}`)
		fs.mkdirSync(outDir, { recursive: true })
		fs.writeFileSync(
			path.join(outDir, "results.json"),
			JSON.stringify(results, null, 2),
		)
		console.info(outDir)
		console.info(JSON.stringify(results, null, 2))
	})
})
