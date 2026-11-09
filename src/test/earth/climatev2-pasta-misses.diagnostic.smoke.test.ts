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
			observedTemperatureModelRain: exact(
				viaEarthPath({
					temperature: realT,
					dtr: realDtr,
					rain: rainfall.monthly,
				}),
			),
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
