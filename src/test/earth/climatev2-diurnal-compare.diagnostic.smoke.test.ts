import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { CLIMATEV2_DIURNAL } from "@/model/climatev2/diurnal"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { CLIMATEV2_OUTPUTS } from "@/model/climatev2/outputs"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import { SAMPLING } from "@/model/pipelines/import-heightmap/sampling"
import type { GenesisWorld } from "@/model/pipelines/types"
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

function observedDtr(world: GenesisWorld) {
	const raster = loadEarthMonthlyRaster("earth-real-dtr")
	const area = raster.width * raster.height
	const N = world.mesh.numRegions
	const out = new Float32Array(12 * N)
	for (let m = 0; m < 12; m++)
		out.set(
			SAMPLING.sampleSingleBandFloatRaster({
				mesh: world.mesh,
				raster: raster.monthly.subarray(m * area, (m + 1) * area),
				rasterW: raster.width,
				rasterH: raster.height,
				scale: raster.scale,
				nodata: raster.nodata,
			}),
			m * N,
		)
	return out
}

function score(params: {
	world: GenesisWorld
	model: Float32Array
	observed: Float32Array
}) {
	const { world, model, observed } = params
	const { mesh, isLand } = world
	const N = mesh.numRegions
	const lat = new Float64Array(N)
	for (let r = 0; r < N; r++)
		lat[r] =
			(Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) * 180) /
			Math.PI
	const acc = (surface: "land" | "sea") => {
		let n = 0
		let abs = 0
		let bias = 0
		let sm = 0
		let so = 0
		let smm = 0
		let soo = 0
		let smo = 0
		const bands = LAT_BANDS.map(() => ({ model: 0, observed: 0, area: 0 }))
		const monthsModel = new Float64Array(12)
		const monthsObs = new Float64Array(12)
		const monthsArea = new Float64Array(12)
		for (let m = 0; m < 12; m++)
			for (let r = 0; r < N; r++) {
				if ((surface === "land") !== Boolean(isLand[r])) continue
				const i = m * N + r
				const o = observed[i]
				const x = model[i]
				if (!Number.isFinite(o) || !Number.isFinite(x)) continue
				const a = mesh.regionArea[r]
				n += a
				abs += a * Math.abs(x - o)
				bias += a * (x - o)
				sm += a * x
				so += a * o
				smm += a * x * x
				soo += a * o * o
				smo += a * x * o
				const b = LAT_BANDS.findIndex(
					(band) => lat[r] >= band.lo && lat[r] < band.hi,
				)
				if (b >= 0) {
					bands[b].model += a * x
					bands[b].observed += a * o
					bands[b].area += a
				}
				monthsModel[m] += a * x
				monthsObs[m] += a * o
				monthsArea[m] += a
			}
		const mx = sm / n
		const mo = so / n
		const cov = smo / n - mx * mo
		const round = (x: number) => Number(x.toFixed(2))
		return {
			maeC: round(abs / n),
			biasC: round(bias / n),
			correlation: round(
				cov / Math.sqrt((smm / n - mx * mx) * (soo / n - mo * mo)),
			),
			meanModelC: round(mx),
			meanObservedC: round(mo),
			bands: Object.fromEntries(
				LAT_BANDS.map((band, b) => [
					band.label,
					{
						model: round(bands[b].model / bands[b].area),
						observed: round(bands[b].observed / bands[b].area),
					},
				]),
			),
			janJul: {
				model: [
					round(monthsModel[0] / monthsArea[0]),
					round(monthsModel[6] / monthsArea[6]),
				],
				observed: [
					round(monthsObs[0] / monthsArea[0]),
					round(monthsObs[6] / monthsArea[6]),
				],
			},
		}
	}
	return { land: acc("land"), sea: acc("sea") }
}

describe("climatev2 diurnal range vs WorldClim / NCEP (diagnostic)", () => {
	it(
		"compares the physical diurnal range on Earth's terrain",
		{ timeout: 1_800_000 },
		() => {
			const world = CLIMATE_EARTH.importWorld()
			const orbit = CLIMATEV2_ORBIT.fromParams(world.params)
			const result = planetClimate(
				{
					xyz: world.mesh.r_xyz,
					elevKm: world.elevation_km,
					axes: "z-up",
					land: world.isLand,
				},
				{
					...orbit,
					seed: world.params.seed,
					greenhouseWm2: 0,
					onCell: () => undefined,
				},
			)
			const weights = CLIMATEV2_OUTPUTS.bilinearWeights({
				mesh: world.mesh,
				grid: result.grid,
			})
			const observed = observedDtr(world)
			const { monthly } = CLIMATEV2_DIURNAL.cells({
				result,
				weights,
				isLand: world.isLand,
			})
			const scored = score({ world, model: monthly, observed })
			console.log(
				`day cycle: land MAE ${scored.land.maeC} bias ${scored.land.biasC} r ${scored.land.correlation} | sea MAE ${scored.sea.maeC} bias ${scored.sea.biasC}`,
			)
			const rows = [{ label: "day cycle", ...scored }]
			const ours = score({ world, model: world.dtr_monthly, observed })
			console.log(
				`ours (pipeline DTR): land MAE ${ours.land.maeC} bias ${ours.land.biasC} r ${ours.land.correlation} | sea MAE ${ours.sea.maeC} bias ${ours.sea.biasC}`,
			)
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = path.join("stats", "climate", `${stamp}-diurnal-compare`)
			fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(
				path.join(dir, "results.json"),
				JSON.stringify({ ours, rows }, null, 2),
			)
			expect(rows.length).toBeGreaterThan(0)
		},
	)
})
