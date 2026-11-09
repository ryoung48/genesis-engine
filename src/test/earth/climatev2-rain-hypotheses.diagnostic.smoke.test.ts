import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import { setParams } from "@/model/climatev2/vendor/config.js"
import { loadEarthMonthlyRaster } from "@/test/earth/assets"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"

// Two checks of the rain stage on the imported Earth, before anything is built.
//  1. Frontal rain: on 25–45° winter land, observed over model rain binned by the model's column relative humidity and
//     by the storms' local drive (the surface temperature gradient smoothed over STORM_KM). Frontal rain missing from
//     the model shows as observed ≫ model at moderate humidity, growing with the gradient.
//  2. Desert leak: on observed-desert land (annual rain below DESERT_MM, 10–40°), the rain stage's moisture budget
//     per point in the year: local evaporation, the eddy mixing's convergence (from the solver's own face
//     coefficients) and the wind's (the remainder, P − E − mixing).
// CLIMATE_PARAMS (JSON) overrides v2's settings.

const MONTHS = 12
const DEG = Math.PI / 180
const STORM_KM = 900
const DESERT_MM = 250
const EPS_MM = 10
const RH_BINS = [0, 0.4, 0.45, 0.5, 0.55, 0.6, 2]

type Grid = {
	w: number
	h: number
	size: number
	step: number
	radiusM: number
	lat: Float64Array
	lon: Float64Array
}
type RainDebug = {
	g: Grid
	prep: {
		Krow: Float64Array
		rate: Float64Array
		beta: Float64Array
		faces: { e: Float64Array; n: Float64Array }
	}[]
	Wk: Float64Array[]
	results: { P: Float64Array; E: Float64Array }[]
	land: Float64Array
}

function smoothBox({
	grid,
	field,
	km,
}: {
	grid: Grid
	field: Float64Array
	km: number
}) {
	const { w, h } = grid
	const kmPerCell = (grid.radiusM / 1000) * grid.step * DEG
	const ny = Math.max(1, Math.round(km / kmPerCell))
	const tmp = new Float64Array(field.length)
	const out = new Float64Array(field.length)
	for (let j = 0; j < h; j++) {
		const nx = Math.min(
			w >> 1,
			Math.round(ny / Math.max(0.05, Math.cos(grid.lat[j] * DEG))),
		)
		for (let i = 0; i < w; i++) {
			let s = 0
			for (let d = -nx; d <= nx; d++) s += field[j * w + ((i + d + w) % w)]
			tmp[j * w + i] = s / (2 * nx + 1)
		}
	}
	for (let j = 0; j < h; j++)
		for (let i = 0; i < w; i++) {
			let s = 0
			let n = 0
			for (let d = -ny; d <= ny; d++) {
				const jj = j + d
				if (jj < 0 || jj >= h) continue
				s += tmp[jj * w + i]
				n++
			}
			out[j * w + i] = s / n
		}
	return out
}

describe("climatev2 rain hypotheses (diagnostic)", () => {
	it("checks the frontal-rain and desert-leak hypotheses", () => {
		if (process.env.CLIMATE_PARAMS)
			setParams(JSON.parse(process.env.CLIMATE_PARAMS))
		;(globalThis as { RAIN_DEBUG?: boolean }).RAIN_DEBUG = true
		const world = CLIMATE_EARTH.importWorld()
		const result = planetClimate(
			{
				xyz: world.mesh.r_xyz,
				elevKm: world.elevation_km,
				axes: "z-up",
				land: world.isLand,
			},
			{
				...CLIMATEV2_ORBIT.fromParams(world.params),
				seed: world.params.seed,
				greenhouseWm2: 0,
				onCell: () => undefined,
			},
		)
		;(globalThis as { RAIN_DEBUG?: boolean }).RAIN_DEBUG = false
		const grid = result.grid as unknown as Grid
		const G = grid.size
		const points = new Float32Array(3 * G)
		for (let j = 0; j < grid.h; j++)
			for (let i = 0; i < grid.w; i++) {
				const c = j * grid.w + i
				points[3 * c] =
					Math.cos(grid.lat[j] * DEG) * Math.cos(grid.lon[i] * DEG)
				points[3 * c + 1] =
					Math.cos(grid.lat[j] * DEG) * Math.sin(grid.lon[i] * DEG)
				points[3 * c + 2] = Math.sin(grid.lat[j] * DEG)
			}
		const pr = loadEarthMonthlyRaster("earth-real-precipitation")
		const obs = OBSERVED_EARTH.sampleMonthlyFloatRaster({
			mesh: { numRegions: G, r_xyz: points } as typeof world.mesh,
			raster: pr.monthly,
			rasterW: pr.width,
			rasterH: pr.height,
			months: pr.months,
			scale: pr.scale,
			nodata: pr.nodata,
		})
		const land = result.surface.landFrac
		const P = result.months.P
		const T = result.stages.temperature.monthly
		const rain = result.stages.rain as unknown as {
			r: Float32Array
			stability: Float32Array
			debug: RainDebug
		}
		const K = result.anchorMonths.length
		const anchorMonth = result.anchorMonths.map(
			(m) => ((Math.round(m) % MONTHS) + MONTHS) % MONTHS,
		)
		const round = (x: number, d = 2) => Number(x.toFixed(d))

		// ── 1. Frontal rain ──
		const kmPerDeg = (grid.radiusM / 1000) * DEG
		const gradient = new Float64Array(MONTHS * G)
		for (let m = 0; m < MONTHS; m++) {
			const field = smoothBox({
				grid,
				field: Float64Array.from(T.subarray(m * G, (m + 1) * G)),
				km: STORM_KM,
			})
			for (let j = 0; j < grid.h; j++) {
				const cl = Math.max(0.05, Math.cos(grid.lat[j] * DEG))
				for (let i = 0; i < grid.w; i++) {
					const c = j * grid.w + i
					const e = j * grid.w + ((i + 1) % grid.w)
					const wv = j * grid.w + ((i - 1 + grid.w) % grid.w)
					const n = j > 0 ? c - grid.w : c
					const s = j < grid.h - 1 ? c + grid.w : c
					const dx = (field[e] - field[wv]) / (2 * grid.step * kmPerDeg * cl)
					const dy =
						(field[n] - field[s]) /
						((n === c || s === c ? 1 : 2) * grid.step * kmPerDeg)
					gradient[m * G + c] = 1000 * Math.hypot(dx, dy)
				}
			}
		}
		type Cell = {
			w: number
			model: number
			observed: number
			rh: number
			grad: number
			stab: number
			rate: number
		}
		type Key = "grad" | "stab" | "rate"
		const rateRatio = Math.round(rain.debug.g.step / grid.step)
		const seasonCells = ({
			season,
			latMax,
		}: {
			season: "winter" | "summer"
			latMax: number
		}) => {
			const cells: Cell[] = []
			for (let j = 0; j < grid.h; j++) {
				const lat = grid.lat[j]
				if (Math.abs(lat) < 25 || Math.abs(lat) >= latMax) continue
				const months =
					lat >= 0 === (season === "winter") ? [11, 0, 1] : [5, 6, 7]
				for (let i = 0; i < grid.w; i++) {
					const c = j * grid.w + i
					if (land[c] < 0.5 || !Number.isFinite(obs[c])) continue
					let model = 0
					let observed = 0
					let grad = 0
					for (const m of months) {
						model += P[m * G + c]
						observed += obs[m * G + c]
						grad += gradient[m * G + c] / 3
					}
					let rh = 0
					let stab = 0
					let rate = 0
					let n = 0
					const gc =
						Math.floor(j / rateRatio) * rain.debug.g.w +
						Math.floor(i / rateRatio)
					for (let k = 0; k < K; k++)
						if (months.includes(anchorMonth[k])) {
							rh += rain.r[k * G + c]
							stab += rain.stability[k * G + c]
							rate += rain.debug.prep[k].rate[gc]
							n++
						}
					cells.push({
						w: Math.cos(lat * DEG),
						model,
						observed,
						rh: rh / n,
						grad,
						stab: stab / n,
						rate: rate / n,
					})
				}
			}
			return cells
		}
		const frontal = ({
			season,
			key,
			latMax,
		}: {
			season: "winter" | "summer"
			key: Key
			latMax: number
		}) => {
			const cells = seasonCells({ season, latMax })
			const grads = cells.map((x) => x[key]).sort((a, b) => a - b)
			const t1 = grads[Math.floor(grads.length / 3)]
			const t2 = grads[Math.floor((2 * grads.length) / 3)]
			const gradBin = (g: number) => (g < t1 ? 0 : g < t2 ? 1 : 2)
			const table = RH_BINS.slice(0, -1).map((lo, b) => {
				const row: Record<string, unknown> = {
					rh: `${lo}-${RH_BINS[b + 1] > 1 ? "" : RH_BINS[b + 1]}`,
				}
				for (let gb = 0; gb < 3; gb++) {
					let w = 0
					let m = 0
					let o = 0
					for (const x of cells) {
						if (x.rh < lo || x.rh >= RH_BINS[b + 1] || gradBin(x[key]) !== gb)
							continue
						w += x.w
						m += x.w * x.model
						o += x.w * x.observed
					}
					row[["low", "mid", "high"][gb]] = w
						? {
								ratio: round((o + EPS_MM * w) / (m + EPS_MM * w)),
								modelMm: round(m / w, 0),
								observedMm: round(o / w, 0),
								areaPct: round(
									(100 * w) / cells.reduce((s, x) => s + x.w, 0),
									1,
								),
							}
						: null
				}
				return row
			})
			const corr = (by: "rh" | Key) => {
				let sw = 0
				let sx = 0
				let sy = 0
				for (const x of cells) {
					const y = Math.log((x.observed + EPS_MM) / (x.model + EPS_MM))
					sw += x.w
					sx += x.w * x[by]
					sy += x.w * y
				}
				const mx = sx / sw
				const my = sy / sw
				let cxy = 0
				let cxx = 0
				let cyy = 0
				for (const x of cells) {
					const y = Math.log((x.observed + EPS_MM) / (x.model + EPS_MM)) - my
					const d = x[by] - mx
					cxy += x.w * d * y
					cxx += x.w * d * d
					cyy += x.w * y * y
				}
				return round(cxy / Math.sqrt(cxx * cyy))
			}
			return {
				key,
				terciles: [round(t1, 3), round(t2, 3)],
				table,
				correlationOfObservedOverModel: {
					columnRh: corr("rh"),
					[key]: corr(key),
				},
			}
		}

		// ── 2. Desert leak ──
		const d = rain.debug
		const g = d.g
		const ratio = Math.round(g.step / grid.step)
		const SEC = 30.44 * 86400
		const budgetSums = { P: 0, E: 0, mixing: 0, wind: 0 }
		const landBudget = { P: 0, E: 0, mixing: 0, wind: 0 }
		let landW = 0
		const seasonal = {
			winter: { P: 0, E: 0, mixing: 0, wind: 0, w: 0 },
			summer: { P: 0, E: 0, mixing: 0, wind: 0, w: 0 },
		}
		let desertW = 0
		let desertCells = 0
		let modelAridHits = 0
		let modelDesertMm = 0
		let observedDesertMm = 0
		const dlam = (2 * Math.PI) / g.w
		const dphi = Math.PI / g.h
		const mixingAt = (k: number, c: number) => {
			const p = d.prep[k]
			const j = Math.floor(c / g.w)
			const i = c % g.w
			const phi = Math.PI / 2 - (j + 0.5) * dphi
			const cos = Math.cos(phi)
			const cosN = j === 0 ? 0 : Math.cos(phi + dphi / 2)
			const cosS = j === g.h - 1 ? 0 : Math.cos(phi - dphi / 2)
			const kx = p.Krow[j] / (cos * cos * dlam * dlam)
			const kn =
				j === 0
					? 0
					: (0.5 * (p.Krow[j] + p.Krow[j - 1]) * cosN) / (cos * dphi * dphi)
			const ks =
				j === g.h - 1
					? 0
					: (0.5 * (p.Krow[j] + p.Krow[j + 1]) * cosS) / (cos * dphi * dphi)
			const ws = (x: number) => d.Wk[k][x] / p.beta[x]
			const ce = j * g.w + ((i + 1) % g.w)
			const cw = j * g.w + ((i - 1 + g.w) % g.w)
			let flux =
				kx *
				(p.faces.e[c] * (ws(ce) - ws(c)) + p.faces.e[cw] * (ws(cw) - ws(c)))
			if (j > 0) flux += kn * p.faces.n[c] * (ws(c - g.w) - ws(c))
			if (j < g.h - 1) flux += ks * p.faces.n[c + g.w] * (ws(c + g.w) - ws(c))
			return flux
		}
		for (let j = 0; j < grid.h; j++) {
			const lat = grid.lat[j]
			if (Math.abs(lat) < 10 || Math.abs(lat) >= 40) continue
			for (let i = 0; i < grid.w; i++) {
				const c = j * grid.w + i
				if (land[c] < 0.5 || !Number.isFinite(obs[c])) continue
				let po = 0
				let pm = 0
				for (let m = 0; m < MONTHS; m++) {
					po += obs[m * G + c]
					pm += P[m * G + c]
				}
				if (po >= DESERT_MM) continue
				const wt = Math.cos(lat * DEG)
				desertCells++
				desertW += wt
				observedDesertMm += wt * po
				modelDesertMm += wt * pm
				if (pm < DESERT_MM) modelAridHits += wt
				const gc = Math.floor(j / ratio) * g.w + Math.floor(i / ratio)
				for (let k = 0; k < K; k++) {
					const Pk = d.results[k].P[gc] * SEC
					const Ek = d.results[k].E[gc] * SEC
					const mix = mixingAt(k, gc) * SEC
					const wind = Pk - Ek - mix
					budgetSums.P += (wt * Pk) / K
					budgetSums.E += (wt * Ek) / K
					budgetSums.mixing += (wt * mix) / K
					budgetSums.wind += (wt * wind) / K
					if (d.land[gc] >= 0.95) {
						landBudget.P += (wt * Pk) / K
						landBudget.E += (wt * Ek) / K
						landBudget.mixing += (wt * mix) / K
						landBudget.wind += (wt * wind) / K
						if (k === 0) landW += wt
					}
					const winter = (lat >= 0 ? [11, 0, 1] : [5, 6, 7]).includes(
						anchorMonth[k],
					)
					const summer = (lat >= 0 ? [5, 6, 7] : [11, 0, 1]).includes(
						anchorMonth[k],
					)
					for (const [flag, s] of [
						[winter, seasonal.winter],
						[summer, seasonal.summer],
					] as const)
						if (flag) {
							s.P += wt * Pk
							s.E += wt * Ek
							s.mixing += wt * mix
							s.wind += wt * wind
							s.w += wt
						}
				}
			}
		}
		const per = (o: Record<string, number>, w: number) =>
			Object.fromEntries(
				Object.entries(o).map(([k, v]) => [k, round(v / w, 1)]),
			)
		const desert = {
			cells: desertCells,
			observedAnnualMm: round(observedDesertMm / desertW, 0),
			modelAnnualMm: round(modelDesertMm / desertW, 0),
			modelAridSharePct: round((100 * modelAridHits) / desertW, 1),
			budgetMmPerMonth: per(budgetSums, desertW),
			landOnlyBudgetMmPerMonth: per(landBudget, landW),
			landOnlySharePct: round((100 * landW) / desertW, 1),
			note: "budget on the 3° rain grid before the orographic redistribution and the polar-front baseline; P = E + mixing + wind",
			winterMmPerMonth: per(seasonal.winter, seasonal.winter.w),
			summerMmPerMonth: per(seasonal.summer, seasonal.summer.w),
		}

		// 10–25° land in its dry season (the local winter): the same budget, with the model's and the observed rain
		const dry = { P: 0, E: 0, mixing: 0, wind: 0 }
		let dryW = 0
		let dryModel = 0
		let dryObserved = 0
		for (let j = 0; j < grid.h; j++) {
			const lat = grid.lat[j]
			if (Math.abs(lat) < 10 || Math.abs(lat) >= 25) continue
			const winterM = lat >= 0 ? [11, 0, 1] : [5, 6, 7]
			for (let i = 0; i < grid.w; i++) {
				const c = j * grid.w + i
				if (land[c] < 0.5 || !Number.isFinite(obs[c])) continue
				const wt = Math.cos(lat * DEG)
				for (const m of winterM) {
					dryModel += (wt * P[m * G + c]) / 3
					dryObserved += (wt * obs[m * G + c]) / 3
				}
				dryW += wt
				const gc = Math.floor(j / ratio) * g.w + Math.floor(i / ratio)
				let n = 0
				const acc = { P: 0, E: 0, mixing: 0, wind: 0 }
				for (let k = 0; k < K; k++) {
					if (!winterM.includes(anchorMonth[k])) continue
					const Pk = d.results[k].P[gc] * SEC
					const Ek = d.results[k].E[gc] * SEC
					const mix = mixingAt(k, gc) * SEC
					acc.P += Pk
					acc.E += Ek
					acc.mixing += mix
					acc.wind += Pk - Ek - mix
					n++
				}
				for (const key of Object.keys(dry) as (keyof typeof dry)[])
					dry[key] += (wt * acc[key]) / n
			}
		}
		const drySeason = {
			modelMmPerMonth: round(dryModel / dryW, 1),
			observedMmPerMonth: round(dryObserved / dryW, 1),
			budgetMmPerMonth: per(dry, dryW),
		}
		const out = {
			drySeason1025: drySeason,
			frontalWinter: frontal({ season: "winter", key: "grad", latMax: 45 }),
			frontalSummer: frontal({ season: "summer", key: "grad", latMax: 45 }),
			lawWinterStability: frontal({
				season: "winter",
				key: "stab",
				latMax: 60,
			}),
			lawSummerStability: frontal({
				season: "summer",
				key: "stab",
				latMax: 60,
			}),
			lawWinterRate: frontal({ season: "winter", key: "rate", latMax: 60 }),
			lawSummerRate: frontal({ season: "summer", key: "rate", latMax: 60 }),
			desert,
		}
		console.log(JSON.stringify(out, null, 1))
		const dir = join(
			"stats",
			"climate",
			`${new Date().toISOString().replace(/[:.]/g, "-")}-rain-hypotheses`,
		)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "results.json"), JSON.stringify(out, null, 2))
	}, 3600000)
})
