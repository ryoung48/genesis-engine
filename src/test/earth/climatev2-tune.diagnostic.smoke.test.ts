import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, vi } from "vitest"
import { PASTA } from "@/model/climate/classification/pasta"
import {
	PARAM_PRIORS,
	PARAMS_DEFAULTS,
	resetParams,
	setParams,
} from "@/model/climatev2/vendor/config.js"
import {
	DIURNAL_PARAMS,
	DIURNAL_PRIORS,
} from "@/model/climatev2/vendor/diurnal.js"
import {
	classifyCell,
	KOPPEN_CLASSES,
} from "@/model/climatev2/vendor/koppen.js"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import { POST_ELEVATION } from "@/model/pipelines/post-elevation"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

// Coordinate-descent tune of v2's climate parameters for the PASTA exact match on the imported Earth (after the
// vendor's tuning/climate/coupled-check.mjs --tune): each key in turn stepped up and down by a share of its
// PARAM_PRIORS range, the first step that raises the objective kept, the step halved after a round with none; the
// objective is the PASTA exact match less a pull toward each key's literature value. A step is refused if the Köppen
// exact match, the land rain or temperature error, or the 25–45° winter rain worsens past its guard, or if the
// generated planet turns more arid or drier. Only the post-elevation pipeline is rerun per evaluation (the terrain is
// imported once). Writes the trail and the tuned values to stats/climate/<timestamp>-tune/results.json — copy them
// into PARAMS_DEFAULTS / DIURNAL_PARAMS by hand. TUNE_OBJECTIVE=dtr scores instead the PASTA exact match with the
// observed temperature and rain and only the model's day range (its keys default to DIURNAL_PRIORS'); TUNE_OBJECTIVE=
// rain, with the observed temperature and day range and only the model's rain (its keys default to the rain stage's);
// either way the combined PASTA exact match is guarded too. TUNE_KEYS (comma list) and TUNE_ROUNDS override the defaults.

const OBJECTIVE =
	process.env.TUNE_OBJECTIVE === "dtr" || process.env.TUNE_OBJECTIVE === "rain"
		? process.env.TUNE_OBJECTIVE
		: "pasta"
const KEYS = (
	process.env.TUNE_KEYS ??
	(OBJECTIVE === "dtr"
		? Object.keys(DIURNAL_PRIORS).join(",")
		: OBJECTIVE === "rain"
			? "RAIN_COLUMN_LOCAL,RAIN_STABILITY,RAIN_STORM_RH,RAIN_WIND_DIV_MOIST,RAIN_SOIL_MM,RAIN_STORM_LIFT,RAIN_LAND_CONVECTION,RAIN_HIGH_K_PER_HPA"
			: "RAIN_COLUMN_LOCAL,RAIN_STABILITY,RAIN_STORM_RH,RAIN_WIND_DIV_MOIST,RAIN_SOIL_MM,TEMP_INVERSION_C,RAIN_STORM_LIFT,CIRC_OCEAN_HIGH_HPA,TEMP_LOW_CLOUD_ALBEDO,TEMP_CLOUD_LONGWAVE_WINDOW")
).split(",")
const DIURNAL_DEFAULTS = { ...DIURNAL_PARAMS }
const ROUNDS = Number(process.env.TUNE_ROUNDS ?? 4)
const START_STEP = 0.25
// the vendor's pull toward the literature value: 0.02 of its objective (a fraction) per range² → 2 points of PASTA
// exact match for a key moved across its whole range
const PRIOR_POINTS = 2
const MIN_GAIN_POINTS = 0.01
// guards against the start: the vendor's temperature (0.15 °C) and planet guards (1 pt more arid, rain −3 %); a
// Köppen exact match no more than 0.5 pt worse, the land rain error no more than 2 % worse, the 25–45° winter
// rain ratio no more than 0.03 lower; under the DTR objective, the combined PASTA exact match no more than 0.5 pt worse
const GUARD = {
	pastaPoints: 0.5,
	koppenPoints: 0.5,
	rainMaeShare: 0.02,
	temperatureC: 0.15,
	winterRatio: 0.03,
	planetAridPoints: 1,
	planetRainShare: 0.03,
}
const MONTHS = 12
const EPS_MM = 10
const DEG = Math.PI / 180

type PostInput = Parameters<typeof POST_ELEVATION.runPostElevationPipeline>[0]
type Post = ReturnType<typeof POST_ELEVATION.runPostElevationPipeline>
type Params = Record<string, number>
type EarthScore = {
	pastaExact: number
	koppenExact: number
	rainMaeMm: number
	temperatureMaeC: number
	winterRatio2545: number
	dtrSwapPasta: number
	rainSwapPasta: number
	dtrMaeC: number
}
type PlanetScore = { aridPct: number; rainMm: number }

function captureInput(run: () => unknown): PostInput {
	const spy = vi.spyOn(POST_ELEVATION, "runPostElevationPipeline")
	run()
	const input = spy.mock.calls[0][0]
	spy.mockRestore()
	return input
}

function rerun({ input, params }: { input: PostInput; params: Params }): Post {
	resetParams()
	Object.assign(DIURNAL_PARAMS, DIURNAL_DEFAULTS)
	const climateKeys = Object.keys(params).filter(
		(k) => !(k in DIURNAL_DEFAULTS),
	)
	setParams(Object.fromEntries(climateKeys.map((k) => [k, params[k]])))
	for (const k of Object.keys(params))
		if (k in DIURNAL_DEFAULTS) DIURNAL_PARAMS[k] = params[k]
	return POST_ELEVATION.runPostElevationPipeline(input)
}

function scoreEarth({
	input,
	params,
}: {
	input: PostInput
	params: Params
}): EarthScore {
	const post = rerun({ input, params })
	const { mesh, isLand } = input
	const N = mesh.numRegions
	const modelT = post.climate.temperature_monthly
	const modelP = post.rainfall.monthly
	const realT = post.climate.real_temperature_monthly as Float32Array
	const realP = post.rainfall.real_monthly as Float32Array
	const realDtr = post.observedDtr?.real_monthly
	const realPasta = post.realPastaClimate as Uint8Array
	const modelDtr = post.climate.temperature_monthly_range as Float32Array
	const swapZones = ({
		dtr,
		rain,
	}: {
		dtr: Float32Array
		rain: Float32Array
	}) =>
		(
			PASTA.assignEarthPastaClimate({
				mesh,
				isLand,
				climate: post.climate,
				rainfall: { ...post.rainfall, real_monthly: rain },
				params: input.params,
				realDtrMonthly: dtr,
				iceThickness: post.iceThickness,
				iceMinMonthly: post.iceMinMonthly,
				iceMaxMonthly: post.iceMaxMonthly,
			}) as { zones: Uint8Array }
		).zones
	const dtrSwap = swapZones({ dtr: modelDtr, rain: realP })
	const rainSwap = swapZones({ dtr: realDtr as Float32Array, rain: modelP })
	let rainHit = 0
	let dtrHit = 0
	let dtrErr = 0
	const T12m = new Float64Array(MONTHS)
	const T12o = new Float64Array(MONTHS)
	const P12m = new Float64Array(MONTHS)
	const P12o = new Float64Array(MONTHS)
	let pastaN = 0
	let pastaHit = 0
	let kN = 0
	let kHit = 0
	let rainErr = 0
	let tempErr = 0
	let wSum = 0
	let wLog = 0
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let finite = true
		let dtrFinite = true
		for (let m = 0; m < MONTHS; m++) {
			const i = m * N + r
			T12m[m] = modelT[i]
			T12o[m] = realT[i]
			P12m[m] = modelP[i]
			P12o[m] = realP[i]
			if (!Number.isFinite(realT[i]) || !Number.isFinite(realP[i]))
				finite = false
			if (!realDtr || !Number.isFinite(realDtr[i])) dtrFinite = false
		}
		if (!finite) continue
		if (dtrFinite) {
			pastaN++
			if (post.pastaClimate[r] === realPasta[r]) pastaHit++
			if (dtrSwap[r] === realPasta[r]) dtrHit++
			if (rainSwap[r] === realPasta[r]) rainHit++
			for (let m = 0; m < MONTHS; m++)
				dtrErr +=
					Math.abs(modelDtr[m * N + r] - (realDtr as Float32Array)[m * N + r]) /
					MONTHS
		}
		kN++
		if (
			KOPPEN_CLASSES[classifyCell(T12m, P12m)].code ===
			KOPPEN_CLASSES[classifyCell(T12o, P12o)].code
		)
			kHit++
		let pm = 0
		let po = 0
		let tm = 0
		let to = 0
		for (let m = 0; m < MONTHS; m++) {
			pm += P12m[m]
			po += P12o[m]
			tm += T12m[m] / MONTHS
			to += T12o[m] / MONTHS
		}
		rainErr += Math.abs(pm - po)
		tempErr += Math.abs(tm - to)
		const lat =
			Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) / DEG
		if (Math.abs(lat) < 25 || Math.abs(lat) >= 45) continue
		const winter = lat >= 0 ? [11, 0, 1] : [5, 6, 7]
		let wm = 0
		let wo = 0
		for (const m of winter) {
			wm += P12m[m]
			wo += P12o[m]
		}
		const a = mesh.regionArea[r]
		wSum += a
		wLog += a * Math.log((wm + EPS_MM) / (wo + EPS_MM))
	}
	return {
		pastaExact: (100 * pastaHit) / pastaN,
		koppenExact: (100 * kHit) / kN,
		rainMaeMm: rainErr / kN,
		temperatureMaeC: tempErr / kN,
		winterRatio2545: Math.exp(wLog / wSum),
		dtrSwapPasta: (100 * dtrHit) / pastaN,
		rainSwapPasta: (100 * rainHit) / pastaN,
		dtrMaeC: dtrErr / pastaN,
	}
}

function scorePlanet({
	input,
	params,
}: {
	input: PostInput
	params: Params
}): PlanetScore {
	const post = rerun({ input, params })
	const { mesh, isLand } = input
	const N = mesh.numRegions
	const T12 = new Float64Array(MONTHS)
	const P12 = new Float64Array(MONTHS)
	let n = 0
	let arid = 0
	let rain = 0
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let p = 0
		for (let m = 0; m < MONTHS; m++) {
			T12[m] = post.climate.temperature_monthly[m * N + r]
			P12[m] = post.rainfall.monthly[m * N + r]
			p += P12[m]
		}
		const code = KOPPEN_CLASSES[classifyCell(T12, P12)].code
		if (code.startsWith("E")) continue
		n++
		rain += p
		if (code.startsWith("B")) arid++
	}
	return { aridPct: (100 * arid) / n, rainMm: rain / n }
}

describe("climatev2 tune (diagnostic)", () => {
	it(
		"tunes v2's climate parameters for the PASTA exact match on Earth",
		() => {
			const t0 = performance.now()
			const earth = captureInput(() => CLIMATE_EARTH.importWorld())
			const planet = captureInput(() =>
				GENERATE_WORLD.generateGenesisWorld({
					params: { seed: 14963991, ...DEFAULT_WORLD_PARAMS, tideLock: null },
				}),
			)
			const priors: Record<
				string,
				{ value: number; min: number; max: number }
			> = {
				...PARAM_PRIORS,
				...DIURNAL_PRIORS,
			}
			const keys = KEYS.filter((k) => priors[k])
			const prior = (p: Params) =>
				PRIOR_POINTS *
				keys.reduce(
					(s, k) =>
						s +
						((p[k] - priors[k].value) / (priors[k].max - priors[k].min)) ** 2,
					0,
				)
			const objective = (e: EarthScore, p: Params) =>
				(OBJECTIVE === "dtr"
					? e.dtrSwapPasta
					: OBJECTIVE === "rain"
						? e.rainSwapPasta
						: e.pastaExact) - prior(p)
			const round = (x: number) => Number(x.toFixed(3))
			const line = (e: EarthScore) =>
				`PASTA ${e.pastaExact.toFixed(2)}% · Köppen ${e.koppenExact.toFixed(2)}% · rain MAE ${e.rainMaeMm.toFixed(1)} mm · T MAE ${e.temperatureMaeC.toFixed(3)} °C · 25–45° winter ${e.winterRatio2545.toFixed(3)} · rain-swap PASTA ${e.rainSwapPasta.toFixed(2)}% · DTR-swap PASTA ${e.dtrSwapPasta.toFixed(2)}% · DTR MAE ${e.dtrMaeC.toFixed(2)} °C`

			let best: Params = Object.fromEntries(
				keys.map((k) => [
					k,
					k in DIURNAL_DEFAULTS ? DIURNAL_DEFAULTS[k] : PARAMS_DEFAULTS[k],
				]),
			)
			let bestE = scoreEarth({ input: earth, params: best })
			const start = bestE
			const planet0 = scorePlanet({ input: planet, params: best })
			let bestPlanet = planet0
			let evaluations = 1
			const trail: unknown[] = [
				{ step: "start", params: best, earth: start, planet: planet0 },
			]
			console.log(
				`${OBJECTIVE} tune of ${keys.join(", ")}; setup ${((performance.now() - t0) / 1000).toFixed(0)} s`,
			)
			console.log(
				`  start: ${line(start)} · planet arid ${planet0.aridPct.toFixed(2)}%, rain ${planet0.rainMm.toFixed(0)} mm`,
			)
			const guarded = (e: EarthScore) =>
				e.pastaExact >= start.pastaExact - GUARD.pastaPoints &&
				e.koppenExact >= start.koppenExact - GUARD.koppenPoints &&
				e.rainMaeMm <= start.rainMaeMm * (1 + GUARD.rainMaeShare) &&
				e.temperatureMaeC <= start.temperatureMaeC + GUARD.temperatureC &&
				e.winterRatio2545 >= start.winterRatio2545 - GUARD.winterRatio
			const planetOk = (p: PlanetScore) =>
				p.aridPct <= planet0.aridPct + GUARD.planetAridPoints &&
				p.rainMm >= (1 - GUARD.planetRainShare) * planet0.rainMm

			let step = START_STEP
			for (let r = 0; r < ROUNDS; r++) {
				let improved = false
				for (const k of keys) {
					const pr = priors[k]
					for (const dir of [1, -1]) {
						const value = Math.max(
							pr.min,
							Math.min(pr.max, best[k] + dir * step * (pr.max - pr.min)),
						)
						if (value === best[k]) continue
						const trial = { ...best, [k]: value }
						const e = scoreEarth({ input: earth, params: trial })
						evaluations++
						console.log(`      try ${k} = ${round(value)}: ${line(e)}`)
						const gain = objective(e, trial) - objective(bestE, best)
						if (!(gain > MIN_GAIN_POINTS)) continue
						if (!guarded(e)) {
							console.log(
								`    ${k} → ${round(value)} refused by a guard: ${line(e)}`,
							)
							trail.push({ step: "guard", key: k, value, earth: e })
							continue
						}
						const p = scorePlanet({ input: planet, params: trial })
						if (!planetOk(p)) {
							console.log(
								`    ${k} → ${round(value)} refused by the planet: arid ${p.aridPct.toFixed(2)}%, rain ${p.rainMm.toFixed(0)} mm`,
							)
							trail.push({ step: "planet", key: k, value, earth: e, planet: p })
							continue
						}
						best = trial
						bestE = e
						bestPlanet = p
						improved = true
						console.log(`    ${k} → ${round(value)}: ${line(e)}`)
						trail.push({ step: "accept", key: k, value, earth: e, planet: p })
						break
					}
				}
				console.log(
					`  round ${r + 1} (step ${(100 * step).toFixed(1)} %): ${line(bestE)} · ${evaluations} evaluations, ${((performance.now() - t0) / 60000).toFixed(1)} min`,
				)
				if (!improved) step /= 2
			}
			resetParams()
			Object.assign(DIURNAL_PARAMS, DIURNAL_DEFAULTS)
			console.log(
				`  tuned: ${keys.map((k) => `${k}=${round(best[k])}`).join(", ")}`,
			)
			const dir = join(
				"stats",
				"climate",
				`${new Date().toISOString().replace(/[:.]/g, "-")}-tune`,
			)
			mkdirSync(dir, { recursive: true })
			writeFileSync(
				join(dir, "results.json"),
				JSON.stringify(
					{
						keys,
						guard: GUARD,
						start,
						tuned: bestE,
						planetStart: planet0,
						planetTuned: bestPlanet,
						params: best,
						evaluations,
						minutes: (performance.now() - t0) / 60000,
						trail,
					},
					null,
					2,
				),
			)
			console.log(`  saved ${dir}`)
		},
		4 * 3600000,
	)
})
