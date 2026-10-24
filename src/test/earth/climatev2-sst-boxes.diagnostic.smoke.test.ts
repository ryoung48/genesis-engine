import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import { setParams } from "@/model/climatev2/vendor/config.js"
import { loadEarthMonthlyRaster } from "@/test/earth/assets"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"

// v2's sea surface against observed SST in the upwelling and monsoon seas, with the ocean's heat
// terms there (W/m², annual): what sets each sea's temperature. CLIMATE_PARAMS (JSON) overrides v2's settings.

const MONTHS = 12
const BOXES = [
	{ name: "Peru", lat0: -20, lat1: -10, lon0: -90, lon1: -78 },
	{ name: "Namibia", lat0: -25, lat1: -10, lon0: 0, lon1: 13 },
	{ name: "California", lat0: 20, lat1: 35, lon0: -130, lon1: -117 },
	{ name: "Canary", lat0: 15, lat1: 28, lon0: -30, lon1: -16 },
	{ name: "Bay of Bengal", lat0: 8, lat1: 20, lon0: 82, lon1: 95 },
	{ name: "Arabian Sea", lat0: 8, lat1: 22, lon0: 55, lon1: 72 },
	{ name: "Warm pool", lat0: -10, lat1: 10, lon0: 130, lon1: 160 },
	{ name: "Gulf of Guinea", lat0: -5, lat1: 5, lon0: -10, lon1: 10 },
] as const

describe("climatev2 sea-surface boxes (diagnostic)", () => {
	it("compares v2's sea surface and its heat terms with observed SST", () => {
		if (process.env.CLIMATE_PARAMS)
			setParams(JSON.parse(process.env.CLIMATE_PARAMS))
		const world = CLIMATE_EARTH.importWorld()
		const { mesh, isLand } = world
		const result = planetClimate(
			{
				xyz: mesh.r_xyz,
				elevKm: world.elevation_km,
				axes: "z-up",
				land: isLand,
			},
			{
				...CLIMATEV2_ORBIT.fromParams(world.params),
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
		const sst = loadEarthMonthlyRaster("earth-real-sst")
		const observed = OBSERVED_EARTH.sampleMonthlyFloatRaster({
			mesh: { numRegions: grid.size, r_xyz: points } as typeof mesh,
			raster: sst.monthly,
			rasterW: sst.width,
			rasterH: sst.height,
			months: sst.months,
			scale: sst.scale,
			nodata: sst.nodata,
		})
		const model = result.stages.temperature.monthlySL
		const ocean = result.stages.ocean
		const landFrac = result.surface.landFrac
		const round = (x: number) => Number(x.toFixed(2))
		const boxes = BOXES.map(({ name, lat0, lat1, lon0, lon1 }) => {
			const modelM = new Array(MONTHS).fill(0)
			const obsM = new Array(MONTHS).fill(0)
			const terms = {
				qflux: 0,
				qAdvection: 0,
				qUpwelling: 0,
				qOverturning: 0,
				carried: 0,
				coastCold: 0,
				upwelledDT: 0,
				thermocline: 0,
			}
			const fresh: Record<string, number> = {}
			let w = 0
			for (let j = 0; j < grid.h; j++) {
				if (grid.lat[j] < lat0 || grid.lat[j] > lat1) continue
				for (let i = 0; i < grid.w; i++) {
					if (grid.lon[i] < lon0 || grid.lon[i] > lon1) continue
					const c = j * grid.w + i
					if (landFrac[c] > 0.1 || !Number.isFinite(observed[c])) continue
					const a = Math.cos((grid.lat[j] * Math.PI) / 180)
					w += a
					for (let m = 0; m < MONTHS; m++) {
						modelM[m] += a * model[m * grid.size + c]
						obsM[m] += a * observed[m * grid.size + c]
					}
					for (const key of Object.keys(terms) as (keyof typeof terms)[])
						terms[key] += a * ocean[key][c]
					for (const [key, field] of Object.entries(ocean.freshwater ?? {}))
						fresh[key] = (fresh[key] ?? 0) + a * field[c]
				}
			}
			const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
			// (the upwelling's speed, m/day, from its heat and the upwelled water's cold: q = −ρ c_p w ΔT)
			const upwellingMDay =
				terms.upwelledDT > 0
					? (-terms.qUpwelling / (1025 * 3990 * (terms.upwelledDT / w))) * 86400
					: 0
			const modelC = modelM.map((x) => round(x / w))
			const observedC = obsM.map((x) => round(x / w))
			return {
				name,
				biasC: round(mean(modelC) - mean(observedC)),
				monthlyBiasC: modelC.map((x, m) => round(x - observedC[m])),
				observedC,
				upwellingMDay: round(upwellingMDay / w),
				freshwaterMmMonth: Object.fromEntries(
					Object.entries(fresh).map(([k, v]) => [k, round(v / w)]),
				),
				terms: Object.fromEntries(
					Object.entries(terms).map(([k, v]) => [k, round(v / w)]),
				),
			}
		})
		for (const b of boxes) console.log(JSON.stringify(b))
		// The sea's rain and evaporation by latitude (mm per Earth month), against OAFlux's ocean evaporation: ≈ 100 a
		// month over the whole sea, ≈ 130–160 under the trades, ≈ 90–110 at the equator, ≈ 40–60 poleward of 50°
		// (Yu & Weller 2007)
		const bands = [-90, -50, -30, -10, 10, 30, 50, 90]
		const fresh = ocean.freshwater
		const seaWater = fresh
			? bands.slice(0, -1).map((lo, b) => {
					let w = 0
					let e = 0
					let p = 0
					let r = 0
					const columnRh = result.stages.rain.r
					const K = columnRh.length / grid.size
					for (let j = 0; j < grid.h; j++) {
						if (grid.lat[j] < lo || grid.lat[j] >= bands[b + 1]) continue
						const a = Math.cos((grid.lat[j] * Math.PI) / 180)
						for (let i = 0; i < grid.w; i++) {
							const c = j * grid.w + i
							if (landFrac[c] >= 0.5) continue
							w += a
							e += a * fresh.evaporation[c]
							p += a * fresh.rain[c]
							for (let k = 0; k < K; k++)
								r += (a * columnRh[k * grid.size + c]) / K
						}
					}
					return {
						band: `${lo}..${bands[b + 1]}`,
						evaporation: round(e / w),
						rain: round(p / w),
						columnRh: round(r / w),
					}
				})
			: null
		console.log(JSON.stringify(seaWater))
		const dir = join(
			"stats",
			"climate",
			`${new Date().toISOString().replace(/[:.]/g, "-")}-sst-boxes`,
		)
		mkdirSync(dir, { recursive: true })
		writeFileSync(
			join(dir, "results.json"),
			JSON.stringify({ boxes, seaWater }, null, 2),
		)
	}, 600000)
})
