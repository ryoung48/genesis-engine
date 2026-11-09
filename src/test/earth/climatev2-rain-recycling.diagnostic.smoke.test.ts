import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import { setParams } from "@/model/climatev2/vendor/config.js"
import { HelmholtzSolver } from "@/model/climatev2/vendor/solver.js"
import { loadEarthMonthlyRaster } from "@/test/earth/assets"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"

// How much of v2's land rain is land water rained again, on the imported Earth: a passive tracer of the water the
// land evaporates, carried by the rain stage's own converged operator at each point in the year (its winds, mixing,
// terrain faces) and rained out at the same rate as the column (P / W), so its share of the column is the share of
// the rain that evaporated from land (the continental recycling ratio, van der Ent et al. 2010: ≈ 40 % of the land's
// rain on Earth, the land's mean, from ERA-Interim moisture tracking). Reported by latitude band and season and over
// observed deserts, against the model's rain error there. CLIMATE_PARAMS (JSON) overrides v2's settings.

const MONTHS = 12
const DEG = Math.PI / 180
const BANDS = [0, 10, 25, 35, 45, 60, 90]
const DESERT_MM = 250
const EPS_MM = 10

type Grid = {
	w: number
	h: number
	size: number
	step: number
	lat: Float64Array
}
type Prep = {
	Krow: Float64Array
	beta: Float64Array
	faces: { e: Float64Array; n: Float64Array }
	gu: Float64Array
	gv: Float64Array
	eSea: Float64Array
}
type RainDebug = {
	g: Grid
	prep: Prep[]
	Wk: Float64Array[]
	results: { P: Float64Array; E: Float64Array }[]
	land: Float64Array
}
type Solver = HelmholtzSolver & {
	setRowDiffusion: (dx: ArrayLike<number>, dy: ArrayLike<number>) => void
}

describe("climatev2 rain recycling (diagnostic)", () => {
	it("tracks the land's evaporated water through v2's rain stage", () => {
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
		const d = (result.stages.rain as unknown as { debug: RainDebug }).debug
		const g = d.g
		const K = d.prep.length
		const anchorMonth = result.anchorMonths.map(
			(m) => ((Math.round(m) % MONTHS) + MONTHS) % MONTHS,
		)

		// the tracer's share of the column at each point in the year
		const solver = new HelmholtzSolver(g, 0, 0, {
			conservative: true,
		}) as Solver
		const zero = new Float64Array(g.size)
		const share: Float64Array[] = []
		const allShare: number[] = []
		for (let k = 0; k < K; k++) {
			const p = d.prep[k]
			const W = d.Wk[k]
			const P = d.results[k].P
			const E = d.results[k].E
			const sigma = new Float64Array(g.size)
			const src = new Float64Array(g.size)
			for (let c = 0; c < g.size; c++) {
				sigma[c] = W[c] > 1e-9 ? (P[c] / W[c]) * p.beta[c] : 0
				src[c] = Math.max(0, E[c] - p.eSea[c])
			}
			// (the check: a tracer of all the evaporation, sea and land, is the whole column)
			const A = new Float64Array(g.size)
			solver.setRowDiffusion(p.Krow, p.Krow)
			solver.setOperator(sigma, zero, p.gu, p.gv, 1, p.faces)
			solver.solve(E, zero, A, new Float64Array(g.size), {
				maxCycles: 40,
				tol: 1e-6,
			})
			let num = 0
			let den = 0
			for (let c = 0; c < g.size; c++) {
				num += A[c] * p.beta[c] * Math.cos(g.lat[Math.floor(c / g.w)] * DEG)
				den += W[c] * Math.cos(g.lat[Math.floor(c / g.w)] * DEG)
			}
			allShare.push(num / den)
			solver.setRowDiffusion(p.Krow, p.Krow)
			solver.setOperator(sigma, zero, p.gu, p.gv, 1, p.faces)
			const X = new Float64Array(g.size)
			const Xi = new Float64Array(g.size)
			solver.solve(src, zero, X, Xi, { maxCycles: 40, tol: 1e-6 })
			share.push(
				Float64Array.from(X, (x, c) =>
					W[c] > 1e-9 ? Math.min(1, Math.max(0, (x * p.beta[c]) / W[c])) : 0,
				),
			)
		}

		// observed rain on the 1° grid, for the deserts and the rain error
		const grid = result.grid as unknown as Grid & { lon: Float64Array }
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
		const landFine = result.surface.landFrac
		const Pm = result.months.P
		const ratio = Math.round(g.step / grid.step)
		const round = (x: number, n = 1) => Number(x.toFixed(n))

		type Acc = {
			rain: number
			recycled: number
			model: number
			observed: number
			w: number
		}
		const acc = () => ({ rain: 0, recycled: 0, model: 0, observed: 0, w: 0 })
		const bands = new Map<string, { winter: Acc; summer: Acc; annual: Acc }>()
		const desert = acc()
		const landAll = acc()
		for (let j = 0; j < grid.h; j++) {
			const lat = grid.lat[j]
			const ab = Math.abs(lat)
			let b = 0
			while (b < BANDS.length - 2 && ab >= BANDS[b + 1]) b++
			const key = `${String(BANDS[b]).padStart(2, "0")}-${BANDS[b + 1]}`
			const entry = bands.get(key) ?? {
				winter: acc(),
				summer: acc(),
				annual: acc(),
			}
			bands.set(key, entry)
			const winterM = lat >= 0 ? [11, 0, 1] : [5, 6, 7]
			const summerM = lat >= 0 ? [5, 6, 7] : [11, 0, 1]
			for (let i = 0; i < grid.w; i++) {
				const c = j * grid.w + i
				if (landFine[c] < 0.5 || !Number.isFinite(obs[c])) continue
				const gc = Math.floor(j / ratio) * g.w + Math.floor(i / ratio)
				const wt = Math.cos(lat * DEG)
				let po = 0
				let pmAnnual = 0
				for (let m = 0; m < MONTHS; m++) {
					po += obs[m * G + c]
					pmAnnual += Pm[m * G + c]
				}
				for (let k = 0; k < K; k++) {
					const P = d.results[k].P[gc]
					const rec = P * share[k][gc]
					const m = anchorMonth[k]
					const targets: Acc[] = [entry.annual, landAll]
					if (winterM.includes(m)) targets.push(entry.winter)
					if (summerM.includes(m)) targets.push(entry.summer)
					if (ab >= 10 && ab < 40 && po < DESERT_MM) targets.push(desert)
					for (const t of targets) {
						t.rain += wt * P
						t.recycled += wt * rec
					}
				}
				for (const t of [
					entry.annual,
					landAll,
					...(ab >= 10 && ab < 40 && po < DESERT_MM ? [desert] : []),
				]) {
					t.model += wt * pmAnnual
					t.observed += wt * po
					t.w += wt
				}
				for (const [months, t] of [
					[winterM, entry.winter],
					[summerM, entry.summer],
				] as const) {
					let a = 0
					let o = 0
					for (const m of months) {
						a += Pm[m * G + c]
						o += obs[m * G + c]
					}
					t.model += wt * a
					t.observed += wt * o
					t.w += wt
				}
			}
		}
		const summary = (a: Acc) => ({
			recycledPct: round((100 * a.recycled) / a.rain),
			modelOverObserved: round(
				(a.model + EPS_MM * a.w) / (a.observed + EPS_MM * a.w),
				2,
			),
		})
		const out = {
			landRecycledPct: summary(landAll).recycledPct,
			allEvaporationTracerOverColumn: allShare.map((x) => round(x, 3)),
			reference:
				"van der Ent et al. 2010: continental recycling ratio ≈ 40 % of land rain (land mean, annual)",
			bands: [...bands.entries()]
				.sort((a, b) => a[0].localeCompare(b[0]))
				.map(([band, v]) => ({
					band,
					winter: summary(v.winter),
					summer: summary(v.summer),
					annual: summary(v.annual),
				})),
			observedDeserts: summary(desert),
		}
		console.log(JSON.stringify(out, null, 1))
		const dir = join(
			"stats",
			"climate",
			`${new Date().toISOString().replace(/[:.]/g, "-")}-rain-recycling`,
		)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "results.json"), JSON.stringify(out, null, 2))
	}, 3600000)
})
