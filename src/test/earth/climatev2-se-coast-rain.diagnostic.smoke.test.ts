import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import { resetParams, setParams } from "@/model/climatev2/vendor/config.js"
import { loadEarthMonthlyRaster } from "@/test/earth/assets"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"

// v2's rain on the south-east coasts against observed, with the stability the rain stage carries there, under
// variants that switch off one stability term at a time. CLIMATE_VARIANTS (comma list) picks the variants.

const MONTHS = 12
const BOXES = [
	{ name: "SE US", lat0: 29, lat1: 36, lon0: -90, lon1: -76 },
	{ name: "SE China", lat0: 22, lat1: 31, lon0: 110, lon1: 122 },
	{ name: "SE Brazil", lat0: -30, lat1: -20, lon0: -54, lon1: -40 },
	{ name: "E Australia", lat0: -37, lat1: -25, lon0: 147, lon1: 154 },
	{ name: "SE Africa", lat0: -33, lat1: -24, lon0: 27, lon1: 33 },
	{ name: "California", lat0: 32, lat1: 40, lon0: -124, lon1: -117 },
	{ name: "Central Chile", lat0: -38, lat1: -30, lon0: -73, lon1: -70 },
] as const
const VARIANTS: Record<string, Record<string, number>> = {
	base: {},
	noHigh: { RAIN_HIGH_K_PER_HPA: 0 },
	noStable: { RAIN_STABILITY: 0, RAIN_HIGH_K_PER_HPA: 0 },
	noFrontFade: { RAIN_FRONT_HIGH_HPA: 1e9 },
	oceanHigh5: { CIRC_OCEAN_HIGH_HPA: 5 },
	oceanHigh8: { CIRC_OCEAN_HIGH_HPA: 8 },
	stormRh2x: { RAIN_STORM_RH: 0.526 },
	eddyDiff3x: { RAIN_EDDY_DIFF: 1.8e6 },
}

describe("climatev2 south-east coast rain (diagnostic)", () => {
	it("compares v2's SE-coast rain and stability under stability variants", () => {
		const world = CLIMATE_EARTH.importWorld()
		const { mesh, isLand } = world
		const names =
			process.env.CLIMATE_VARIANTS?.split(",") ?? Object.keys(VARIANTS)
		const round = (x: number) => Number(x.toFixed(1))
		let observed: Float32Array | null = null
		let obsU: Float32Array | null = null
		let obsV: Float32Array | null = null
		const out: Record<string, unknown> = {}
		for (const name of names) {
			resetParams()
			setParams(VARIANTS[name])
			const t0 = performance.now()
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
			if (!observed) {
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
				observed = sample("earth-real-precipitation")
				obsU = sample("earth-real-wind-u")
				obsV = sample("earth-real-wind-v")
			}
			const obs = observed
			const ou = obsU as Float32Array
			const ov = obsV as Float32Array
			const { u: mu, v: mv } = result.stages.circulation
			const rain = result.stages.rain as unknown as {
				stability: Float32Array
				r: Float32Array
				E: Float32Array
			}
			const K = result.anchorMonths.length
			const anchorMonth = result.anchorMonths.map(
				(m) => ((Math.round(m) % MONTHS) + MONTHS) % MONTHS,
			)
			const landFrac = result.surface.landFrac
			const P = result.months.P
			const boxes = BOXES.map(({ name: box, lat0, lat1, lon0, lon1 }) => {
				const summer = lat0 >= 0 ? [5, 6, 7] : [11, 0, 1]
				const winter = lat0 >= 0 ? [11, 0, 1] : [5, 6, 7]
				let w = 0
				let model = 0
				let obsYear = 0
				let modelSummer = 0
				let obsSummer = 0
				let modelWinter = 0
				let obsWinter = 0
				let stabSummer = 0
				let stabWinter = 0
				let nSummer = 0
				let nWinter = 0
				let rWinter = 0
				let eWinter = 0
				let rSummer = 0
				let uW = 0
				let vW = 0
				let ouW = 0
				let ovW = 0
				let nOW = 0
				for (let j = 0; j < grid.h; j++) {
					if (grid.lat[j] < lat0 || grid.lat[j] > lat1) continue
					for (let i = 0; i < grid.w; i++) {
						if (grid.lon[i] < lon0 || grid.lon[i] > lon1) continue
						const c = j * grid.w + i
						if (landFrac[c] < 0.5 || !Number.isFinite(obs[c])) continue
						const a = Math.cos((grid.lat[j] * Math.PI) / 180)
						w += a
						for (let m = 0; m < MONTHS; m++) {
							const pm = P[m * grid.size + c]
							const po = obs[m * grid.size + c]
							model += a * pm
							obsYear += a * po
							if (summer.includes(m)) {
								modelSummer += a * pm
								obsSummer += a * po
							}
							if (winter.includes(m)) {
								modelWinter += a * pm
								obsWinter += a * po
								uW += a * mu[m * grid.size + c]
								vW += a * mv[m * grid.size + c]
								if (Number.isFinite(ou[m * grid.size + c])) {
									ouW += a * ou[m * grid.size + c]
									ovW += a * ov[m * grid.size + c]
									nOW += a
								}
							}
						}
						for (let k = 0; k < K; k++) {
							const s = rain.stability[k * grid.size + c]
							if (summer.includes(anchorMonth[k])) {
								rSummer += a * rain.r[k * grid.size + c]
								stabSummer += a * s
								nSummer += a
							}
							if (winter.includes(anchorMonth[k])) {
								rWinter += a * rain.r[k * grid.size + c]
								eWinter += a * rain.E[k * grid.size + c]
								stabWinter += a * s
								nWinter += a
							}
						}
					}
				}
				return {
					box,
					modelMm: round(model / w),
					observedMm: round(obsYear / w),
					summerModelMm: round(modelSummer / w),
					summerObservedMm: round(obsSummer / w),
					winterModelMm: round(modelWinter / w),
					winterObservedMm: round(obsWinter / w),
					summerStabilityK: nSummer ? round(stabSummer / nSummer) : null,
					winterStabilityK: nWinter ? round(stabWinter / nWinter) : null,
					summerColumnRh: nSummer ? round((100 * rSummer) / nSummer) : null,
					winterColumnRh: nWinter ? round((100 * rWinter) / nWinter) : null,
					winterEvapMm: nWinter ? round(eWinter / nWinter) : null,
					winterWindMs: [round(uW / (3 * w)), round(vW / (3 * w))],
					winterObservedWindMs: nOW
						? [round(ouW / nOW), round(ovW / nOW)]
						: null,
				}
			})
			const seconds = round((performance.now() - t0) / 1000)
			console.log(`variant ${name} (${seconds}s)`)
			for (const b of boxes) console.log(JSON.stringify(b))
			out[name] = { seconds, boxes }
		}
		resetParams()
		const dir = join(
			"stats",
			"climate",
			`${new Date().toISOString().replace(/[:.]/g, "-")}-se-coast-rain`,
		)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "results.json"), JSON.stringify(out, null, 2))
	}, 3600000)
})
