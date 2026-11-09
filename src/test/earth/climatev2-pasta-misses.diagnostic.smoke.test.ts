import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import { PASTA } from "@/model/climate/classification/pasta"
import { setParams } from "@/model/climatev2/vendor/config.js"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"

// Where v2's PASTA classes miss the observed ones on the imported Earth, and why. Swaps through the observed
// classifier path (observed water balance, extremes from mean ± DTR/2): the model's temperature and DTR with the
// observed rain, the observed temperature with the model's rain, and both the model's — the last against the
// model path (its own PET, AET and extremes) shows what the classifier path alone changes. Misses are split into
// aridity (desert/semidesert on one side only), thermal family and same-family subtype. CLIMATE_PARAMS (JSON)
// overrides v2's settings.

const TOP_PAIRS = 25

type Swap = {
	temperature: Float32Array
	dtr: Float32Array
	rain: Float32Array
}

describe("climatev2 PASTA misses (diagnostic)", () => {
	it("breaks v2's PASTA misses down by input and class", () => {
		if (process.env.CLIMATE_PARAMS)
			setParams(JSON.parse(process.env.CLIMATE_PARAMS))
		const world = CLIMATE_EARTH.importWorld()
		const { mesh, isLand, climate, rainfall, params } = world
		const N = mesh.numRegions
		const labels = PASTA.pastaLabels
		const real = world.realPastaClimate as Uint8Array
		const realT = climate.real_temperature_monthly as Float32Array
		const realP = rainfall.real_monthly as Float32Array
		const realDtr = world.observedDtr?.real_monthly as Float32Array
		const modelDtr = climate.temperature_monthly_range as Float32Array
		const scored = new Uint8Array(N)
		let n = 0
		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			let ok = true
			for (let m = 0; m < 12; m++) {
				const i = m * N + r
				if (
					!Number.isFinite(realT[i]) ||
					!Number.isFinite(realP[i]) ||
					!Number.isFinite(realDtr[i])
				)
					ok = false
			}
			if (ok) {
				scored[r] = 1
				n++
			}
		}
		const viaEarthPath = ({ temperature, dtr, rain }: Swap) =>
			(
				PASTA.assignEarthPastaClimate({
					mesh,
					isLand,
					climate: { ...climate, real_temperature_monthly: temperature },
					rainfall: { ...rainfall, real_monthly: rain },
					params,
					realDtrMonthly: dtr,
					iceThickness: world.iceThickness,
					iceMinMonthly: world.iceMinMonthly,
					iceMaxMonthly: world.iceMaxMonthly,
				}) as { zones: Uint8Array }
			).zones
		const exact = (zones: Uint8Array) => {
			let hit = 0
			for (let r = 0; r < N; r++) if (scored[r] && zones[r] === real[r]) hit++
			return Number(((100 * hit) / n).toFixed(2))
		}
		const model = world.pastaClimate
		const modelViaEarth = viaEarthPath({
			temperature: climate.temperature_monthly,
			dtr: modelDtr,
			rain: rainfall.monthly,
		})
		const rainSwapZones = viaEarthPath({
			temperature: realT,
			dtr: realDtr,
			rain: rainfall.monthly,
		})
		const swaps = {
			model: exact(model),
			modelThroughObservedPath: exact(modelViaEarth),
			modelTemperatureObservedRain: exact(
				viaEarthPath({
					temperature: climate.temperature_monthly,
					dtr: modelDtr,
					rain: realP,
				}),
			),
			observedTemperatureModelRain: exact(rainSwapZones),
			modelMeanTemperatureOnly: exact(
				viaEarthPath({
					temperature: climate.temperature_monthly,
					dtr: realDtr,
					rain: realP,
				}),
			),
			modelDtrOnly: exact(
				viaEarthPath({ temperature: realT, dtr: modelDtr, rain: realP }),
			),
		}

		// the PASTA points each latitude band loses (share of all scored land), the model's and through rain alone
		const BANDS = [0, 10, 25, 35, 45, 60, 90]
		const bandLoss = BANDS.slice(0, -1).map((lo, b) => {
			let cells = 0
			let modelMiss = 0
			let rainMiss = 0
			for (let r = 0; r < N; r++) {
				if (!scored[r]) continue
				const lat = Math.abs(
					Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) *
						(180 / Math.PI),
				)
				if (lat < lo || lat >= BANDS[b + 1]) continue
				cells++
				if (model[r] !== real[r]) modelMiss++
				if (rainSwapZones[r] !== real[r]) rainMiss++
			}
			const pts = (x: number) => Number(((100 * x) / n).toFixed(2))
			return {
				band: `${lo}-${BANDS[b + 1]}`,
				landPct: pts(cells),
				modelLostPts: pts(modelMiss),
				rainLostPts: pts(rainMiss),
			}
		})

		// the 10–25° misses through rain alone: which class becomes which, with the model's and the observed rain there
		const bandPairs = (() => {
			const pairs = new Map<
				string,
				{
					n: number
					pm: number
					po: number
					dm: number
					dobs: number
					wetM: number
					wetO: number
				}
			>()
			let nBand = 0
			for (let r = 0; r < N; r++) {
				if (!scored[r]) continue
				const latS =
					Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) *
					(180 / Math.PI)
				const lat = Math.abs(latS)
				if (lat < 10 || lat >= 25) continue
				nBand++
				if (rainSwapZones[r] === real[r]) continue
				const key = `${labels[real[r]]} → ${labels[rainSwapZones[r]]}`
				const a = pairs.get(key) ?? {
					n: 0,
					pm: 0,
					po: 0,
					dm: 0,
					dobs: 0,
					wetM: 0,
					wetO: 0,
				}
				const dryM = latS >= 0 ? [11, 0, 1] : [5, 6, 7]
				const wetMonths = latS >= 0 ? [6, 7, 8] : [0, 1, 2]
				a.n++
				for (let m = 0; m < 12; m++) {
					a.pm += rainfall.monthly[m * N + r]
					a.po += realP[m * N + r]
					if (dryM.includes(m)) {
						a.dm += rainfall.monthly[m * N + r]
						a.dobs += realP[m * N + r]
					}
					if (wetMonths.includes(m)) {
						a.wetM += rainfall.monthly[m * N + r]
						a.wetO += realP[m * N + r]
					}
				}
				pairs.set(key, a)
			}
			return [...pairs.entries()]
				.sort((x, y) => y[1].n - x[1].n)
				.slice(0, 15)
				.map(([pair, a]) => ({
					pair,
					bandPct: Number(((100 * a.n) / nBand).toFixed(1)),
					annualMm: [Math.round(a.pm / a.n), Math.round(a.po / a.n)],
					drySeasonMm: [Math.round(a.dm / a.n), Math.round(a.dobs / a.n)],
					wetSeasonMm: [Math.round(a.wetM / a.n), Math.round(a.wetO / a.n)],
				}))
		})()

		// the 10–25° rain-alone misses by region: how many cells miss, how many of those the model makes too wet, and the
		// model's wet- and dry-season rain over the observed
		const REGIONS = [
			{ name: "Mexico & C. America", south: false, lon0: -118, lon1: -77 },
			{ name: "Caribbean & N. S. America", south: false, lon0: -77, lon1: -55 },
			{ name: "W. Africa & Sahel", south: false, lon0: -18, lon1: 15 },
			{ name: "Arabia", south: false, lon0: 42, lon1: 60, latMin: 12 },
			{ name: "E. Africa & Sudan", south: false, lon0: 15, lon1: 52 },
			{ name: "India & Pakistan", south: false, lon0: 60, lon1: 92 },
			{ name: "SE Asia", south: false, lon0: 92, lon1: 125 },
			{ name: "Brazil & Bolivia", south: true, lon0: -70, lon1: -34 },
			{ name: "Peru & Atacama", south: true, lon0: -80, lon1: -70 },
			{ name: "Southern Africa", south: true, lon0: 10, lon1: 41 },
			{ name: "Madagascar", south: true, lon0: 43, lon1: 51 },
			{ name: "N. Australia", south: true, lon0: 113, lon1: 154 },
		]
		const regions = REGIONS.map((reg) => {
			let cells = 0
			let miss = 0
			let wetter = 0
			let wm = 0
			let wo = 0
			let dm = 0
			let dobs = 0
			for (let r = 0; r < N; r++) {
				if (!scored[r]) continue
				const z = Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))
				const latS = Math.asin(z) * (180 / Math.PI)
				const lon =
					Math.atan2(mesh.r_xyz[3 * r + 1], mesh.r_xyz[3 * r]) * (180 / Math.PI)
				if (
					latS < 0 !== reg.south ||
					Math.abs(latS) < Math.max(10, reg.latMin ?? 0) ||
					Math.abs(latS) >= 25
				)
					continue
				if (lon < reg.lon0 || lon >= reg.lon1) continue
				if (
					REGIONS.find(
						(q) =>
							latS < 0 === q.south &&
							Math.abs(latS) >= (q.latMin ?? 0) &&
							lon >= q.lon0 &&
							lon < q.lon1,
					) !== reg
				)
					continue
				cells++
				const dryM = latS >= 0 ? [11, 0, 1] : [5, 6, 7]
				const wetMonths = latS >= 0 ? [6, 7, 8] : [0, 1, 2]
				let pm = 0
				let po = 0
				for (let m = 0; m < 12; m++) {
					pm += rainfall.monthly[m * N + r]
					po += realP[m * N + r]
					if (dryM.includes(m)) {
						dm += rainfall.monthly[m * N + r]
						dobs += realP[m * N + r]
					}
					if (wetMonths.includes(m)) {
						wm += rainfall.monthly[m * N + r]
						wo += realP[m * N + r]
					}
				}
				if (rainSwapZones[r] !== real[r]) {
					miss++
					if (pm > po) wetter++
				}
			}
			const pct = (x: number, of: number) =>
				of ? Number(((100 * x) / of).toFixed(1)) : null
			return {
				region: reg.name,
				lostPts: pct(miss, n),
				missPct: pct(miss, cells),
				missesTooWetPct: pct(wetter, miss),
				wetSeasonModelOverObserved: wo ? Number((wm / wo).toFixed(2)) : null,
				drySeasonModelOverObserved: dobs
					? Number(((dm + 10 * cells) / (dobs + 10 * cells)).toFixed(2))
					: null,
			}
		})

		const family = (code: string) =>
			code.startsWith("A") ? "A" : (code.match(/^[A-Z]+/)?.[0] ?? code)
		const breakdown = (zones: Uint8Array) => {
			const kinds = { hit: 0, aridity: 0, thermal: 0, subtype: 0 }
			const pairs = new Map<string, number>()
			for (let r = 0; r < N; r++) {
				if (!scored[r]) continue
				const o = labels[real[r]]
				const m = labels[zones[r]]
				if (o === m) {
					kinds.hit++
					continue
				}
				const fo = family(o)
				const fm = family(m)
				if ((fo === "A") !== (fm === "A")) kinds.aridity++
				else if (fo !== fm) kinds.thermal++
				else kinds.subtype++
				const key = `${o} → ${m}`
				pairs.set(key, (pairs.get(key) ?? 0) + 1)
			}
			const pct = (x: number) => Number(((100 * x) / n).toFixed(2))
			return {
				kindsPct: Object.fromEntries(
					Object.entries(kinds).map(([k, v]) => [k, pct(v)]),
				),
				topPairs: [...pairs.entries()]
					.sort((a, b) => b[1] - a[1])
					.slice(0, TOP_PAIRS)
					.map(([pair, count]) => ({ pair, pct: pct(count) })),
			}
		}
		const families = (() => {
			const out = new Map<
				string,
				{ observed: number; model: number; hit: number }
			>()
			for (let r = 0; r < N; r++) {
				if (!scored[r]) continue
				const o = family(labels[real[r]])
				const m = family(labels[model[r]])
				const a = out.get(o) ?? { observed: 0, model: 0, hit: 0 }
				a.observed++
				if (labels[real[r]] === labels[model[r]]) a.hit++
				out.set(o, a)
				const b = out.get(m) ?? { observed: 0, model: 0, hit: 0 }
				b.model++
				out.set(m, b)
			}
			return [...out.entries()]
				.sort((a, b) => b[1].observed - a[1].observed)
				.map(([f, v]) => ({
					family: f,
					observedPct: Number(((100 * v.observed) / n).toFixed(1)),
					modelPct: Number(((100 * v.model) / n).toFixed(1)),
					exactWithinPct: v.observed
						? Number(((100 * v.hit) / v.observed).toFixed(1))
						: null,
				}))
		})()
		const out = {
			cells: n,
			swaps,
			bandLoss,
			bandPairs1025: bandPairs,
			regions1025: regions,
			model: breakdown(model),
			modelThroughObservedPath: breakdown(modelViaEarth),
			families,
		}
		const dir = join(
			"stats",
			"climate",
			`${new Date().toISOString().replace(/[:.]/g, "-")}-pasta-misses`,
		)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "results.json"), JSON.stringify(out, null, 2))
	}, 3600000)
})
