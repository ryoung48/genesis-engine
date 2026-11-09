import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { derivedCirculation } from "@/model/climatev2/vendor/circulation.js"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import { resetParams, setParams } from "@/model/climatev2/vendor/config.js"
import { loadEarthMonthlyRaster } from "@/test/earth/assets"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"

// v2's winter winds on the south-east coasts split by pressure term: the circulation stage rerun on the converged
// temperature with one term switched off at a time (winds are linear in pressure), against observed winds and
// the winter temperature departure from the latitude's mean (model and observed).

const BOXES = [
	{ name: "SE US", lat0: 29, lat1: 36, lon0: -90, lon1: -76 },
	{ name: "SE China", lat0: 22, lat1: 31, lon0: 110, lon1: 122 },
	{ name: "SE Brazil", lat0: -30, lat1: -20, lon0: -54, lon1: -40 },
	{ name: "E Australia", lat0: -37, lat1: -25, lon0: 147, lon1: 154 },
] as const
const VARIANTS: Record<string, Record<string, number>> = {
	full: {},
	noThermal: { CIRC_THERMAL_HPA_PER_K: 0 },
	noOceanHigh: { CIRC_OCEAN_HIGH_HPA: 0 },
	oceanHigh8: { CIRC_OCEAN_HIGH_HPA: 8 },
}

describe("climatev2 south-east coast winds (diagnostic)", () => {
	it("splits v2's SE-coast winter winds by pressure term", () => {
		resetParams()
		const world = CLIMATE_EARTH.importWorld()
		const { mesh, isLand } = world
		const orbit = CLIMATEV2_ORBIT.fromParams(world.params)
		const result = planetClimate(
			{
				xyz: mesh.r_xyz,
				elevKm: world.elevation_km,
				axes: "z-up",
				land: isLand,
			},
			{
				...orbit,
				seed: world.params.seed,
				greenhouseWm2: 0,
				onCell: () => undefined,
			},
		)
		const { grid } = result
		const points = new Float32Array(3 * grid.size)
		for (let j = 0; j < grid.h; j++)
			for (let i = 0; i < grid.w; i++) {
				const c = j * grid.w + i
				const la = (grid.lat[j] * Math.PI) / 180
				const lo = (grid.lon[i] * Math.PI) / 180
				points[3 * c] = Math.cos(la) * Math.cos(lo)
				points[3 * c + 1] = Math.cos(la) * Math.sin(lo)
				points[3 * c + 2] = Math.sin(la)
			}
		const sample = (asset: string) => {
			const pr = loadEarthMonthlyRaster(asset)
			return OBSERVED_EARTH.sampleMonthlyFloatRaster({
				mesh: { numRegions: grid.size, r_xyz: points } as typeof mesh,
				raster: pr.monthly,
				rasterW: pr.width,
				rasterH: pr.height,
				months: pr.months,
				scale: pr.scale,
				nodata: pr.nodata,
			})
		}
		const ou = sample("earth-real-wind-u")
		const ov = sample("earth-real-wind-v")
		const ot = sample("earth-real-temperature")
		const mt = result.stages.temperature.monthly
		const landFrac = result.surface.landFrac
		const ctx = {
			grid,
			surface: result.surface,
			anchorMonths: result.anchorMonths,
			options: { ...orbit, seed: world.params.seed },
		}
		const zonalAnomaly = (
			field: Float32Array,
			m: number,
			c: number,
			j: number,
		) => {
			let s = 0
			let n = 0
			for (let i = 0; i < grid.w; i++) {
				const x = field[m * grid.size + j * grid.w + i]
				if (Number.isFinite(x)) {
					s += x
					n++
				}
			}
			return field[m * grid.size + c] - s / n
		}
		const round = (x: number) => Number(x.toFixed(1))
		const out: Record<string, unknown> = {}
		for (const [name, params] of Object.entries(VARIANTS)) {
			resetParams()
			setParams(params)
			const circ = derivedCirculation()(
				ctx as unknown as Parameters<ReturnType<typeof derivedCirculation>>[0],
				result.stages.temperature as unknown as Parameters<
					ReturnType<typeof derivedCirculation>
				>[1],
			)
			out[name] = BOXES.map(({ name: box, lat0, lat1, lon0, lon1 }) => {
				const winter = lat0 >= 0 ? [11, 0, 1] : [5, 6, 7]
				let w = 0
				let u = 0
				let v = 0
				let p = 0
				let obsU = 0
				let obsV = 0
				let tA = 0
				let otA = 0
				let nObs = 0
				for (let j = 0; j < grid.h; j++) {
					if (grid.lat[j] < lat0 || grid.lat[j] > lat1) continue
					for (let i = 0; i < grid.w; i++) {
						if (grid.lon[i] < lon0 || grid.lon[i] > lon1) continue
						const c = j * grid.w + i
						if (landFrac[c] < 0.5) continue
						const a = Math.cos((grid.lat[j] * Math.PI) / 180)
						for (const m of winter) {
							const k = m * grid.size + c
							w += a
							u += a * circ.u[k]
							v += a * circ.v[k]
							p += a * circ.slp[k]
							tA += a * zonalAnomaly(mt, m, c, j)
							if (Number.isFinite(ou[k]) && Number.isFinite(ot[k])) {
								obsU += a * ou[k]
								obsV += a * ov[k]
								otA += a * zonalAnomaly(ot, m, c, j)
								nObs += a
							}
						}
					}
				}
				return {
					box,
					windMs: [round(u / w), round(v / w)],
					observedWindMs: [round(obsU / nObs), round(obsV / nObs)],
					slpHpa: round(p / w),
					tempVsLatitudeC: round(tA / w),
					observedTempVsLatitudeC: round(otA / nObs),
				}
			})
		}
		resetParams()
		for (const [name, boxes] of Object.entries(out)) {
			console.log(name)
			for (const b of boxes as object[]) console.log(JSON.stringify(b))
		}
		const dir = join(
			"stats",
			"climate",
			`${new Date().toISOString().replace(/[:.]/g, "-")}-se-coast-winds`,
		)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "results.json"), JSON.stringify(out, null, 2))
	}, 3600000)
})
