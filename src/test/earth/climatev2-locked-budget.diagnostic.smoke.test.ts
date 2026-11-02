import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { lockedClimate } from "@/model/climatev2/vendor/climate.js"
import type { GenesisParams } from "@/model/pipelines/types"
import { CLIMATE_EARTH } from "./fixtures/climate-earth"

// Worldbuilding Pasta 2025, "Climate Explorations: Pressure": the starlight that holds ExoPlaSim's rotating Earth near
// 15 °C at each surface pressure (bar → × Earth's)
const EXOPLASIM_SUNLIGHT: Record<string, number> = {
	"0.1": 1.356,
	"0.25": 1.185,
	"0.5": 1.069,
	"1": 1,
	"2": 0.943,
	"4": 0.912,
	"10": 0.911,
}
const PRESSURES_BAR = (process.env.LOCKED_PRESSURES ?? "0.1,0.25,0.5,1,2,4,10")
	.split(",")
	.map(Number)
const EXOPLASIM_SUN = process.env.LOCKED_EXOPLASIM_SUN === "1"
const noCell = (): void => undefined
const r1 = (v: number) => Number(v.toFixed(1))
const r3 = (v: number) => Number(v.toFixed(3))

describe("climatev2 locked energy budget (diagnostic)", () => {
	it(
		"sweeps surface pressure on a locked Earth: temperature, albedo, ice and the budget",
		{ timeout: 3_600_000 },
		() => {
			const world = CLIMATE_EARTH.importWorld()
			const rows = PRESSURES_BAR.map((pressure) => {
				const params: GenesisParams = {
					...world.params,
					tideLock: { type: "solar", target: 0 },
					substellarLon: 0,
					obliquity: 0,
					eccentricity: 0,
					daysPerYear: 1,
					hoursPerDay: 365 * 24,
					pressure,
				}
				const orbit = CLIMATEV2_ORBIT.lockedFromParams(params)
				const sunlight = EXOPLASIM_SUN
					? (EXOPLASIM_SUNLIGHT[String(pressure)] ?? 1)
					: 1
				const t0 = performance.now()
				const result = lockedClimate(
					{
						xyz: world.mesh.r_xyz,
						elevKm: world.elevation_km,
						axes: "z-up",
						land: world.isLand,
					},
					{
						...orbit,
						sunScale: orbit.sunScale * sunlight,
						locked: orbit.locked && {
							...orbit.locked,
							flux: orbit.locked.flux.map((f) => f * sunlight),
						},
						seed: world.params.seed,
						greenhouseWm2: 0,
						onCell: noCell,
					},
				)
				const seconds = (performance.now() - t0) / 1000
				const { grid, surface } = result
				const { temperature } = result.stages
				const G = grid.size
				const sums = {
					all: 0,
					area: 0,
					day: 0,
					dayArea: 0,
					night: 0,
					nightArea: 0,
					seaIce: 0,
					sea: 0,
					landIce: 0,
					land: 0,
					dayLand: 0,
					dayLandArea: 0,
					nightLand: 0,
					nightLandArea: 0,
					nightInversion: 0,
				}
				const band = new Float64Array(6)
				const bandArea = new Float64Array(6)
				let sub = Number.NaN
				let anti = Number.NaN
				let bestSub = -2
				let bestAnti = 2
				for (let j = 0; j < grid.h; j++) {
					const lat = (grid.lat[j] * Math.PI) / 180
					const wj = Math.cos(lat)
					for (let i = 0; i < grid.w; i++) {
						const c = j * grid.w + i
						const lon = (grid.lon[i] * Math.PI) / 180
						const cosTheta = Math.cos(lat) * Math.cos(lon)
						let t = 0
						let ice = 0
						let inv = 0
						for (let m = 0; m < 12; m++) {
							t += temperature.monthlySL[m * G + c] / 12
							ice += temperature.seaIce[m * G + c] / 12
							inv += temperature.inversion[m * G + c] / 12
						}
						sums.all += t * wj
						sums.area += wj
						if (cosTheta > 0) {
							sums.day += t * wj
							sums.dayArea += wj
						} else {
							sums.night += t * wj
							sums.nightArea += wj
						}
						const lf = surface.landFrac[c]
						if (cosTheta > 0) {
							sums.dayLand += (t + inv) * wj * lf
							sums.dayLandArea += wj * lf
						} else {
							sums.nightLand += (t + inv) * wj * lf
							sums.nightInversion += inv * wj * lf
							sums.nightLandArea += wj * lf
						}
						sums.sea += wj * (1 - lf)
						sums.seaIce += wj * (1 - lf) * ice
						sums.land += wj * lf
						sums.landIce += wj * lf * temperature.iceFrac[c]
						const b = Math.min(
							5,
							Math.floor((Math.acos(cosTheta) * 180) / Math.PI / 30),
						)
						band[b] += t * wj
						bandArea[b] += wj
						if (cosTheta > bestSub) {
							bestSub = cosTheta
							sub = t
						}
						if (cosTheta < bestAnti) {
							bestAnti = cosTheta
							anti = t
						}
					}
				}
				const b = temperature.budget
				let net = 0
				let weight = 0
				b.rowLat.forEach((lat, j) => {
					const w = Math.cos((lat * Math.PI) / 180)
					net += b.rowNetWm2[j] * w
					weight += w
				})
				const albedo = b.air + b.vary + b.ground + b.snowIce + b.cloud
				return {
					pressureBar: pressure,
					sunlight,
					seconds: r1(seconds),
					globalMeanC: r1(sums.all / sums.area),
					daysideMeanC: r1(sums.day / sums.dayArea),
					nightsideMeanC: r1(sums.night / sums.nightArea),
					dayNightC: r1(sums.day / sums.dayArea - sums.night / sums.nightArea),
					dayLandC: r1(sums.dayLand / sums.dayLandArea),
					nightLandC: r1(sums.nightLand / sums.nightLandArea),
					nightLandBelowAirC: r1(-sums.nightInversion / sums.nightLandArea),
					substellarC: r1(sub),
					antistellarC: r1(anti),
					meanByAngleC: Array.from(band, (v, i) => r1(v / bandArea[i])),
					seaIceShare: r3(sums.seaIce / sums.sea),
					landIceShare: r3(sums.landIce / sums.land),
					netMeanWm2: r1(net / weight),
					absorbedWm2: r1(b.sunWm2 * (1 - albedo) + b.cloudLongwaveWm2),
					albedo: {
						total: r3(albedo),
						air: r3(b.air),
						ground: r3(b.ground),
						snowIce: r3(b.snowIce),
						cloud: r3(b.cloud),
					},
				}
			})
			for (const row of rows) console.log(JSON.stringify(row))
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = path.join("stats", "climate", `${stamp}-locked-budget`)
			fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(
				path.join(dir, "results.json"),
				JSON.stringify(rows, null, 2),
			)
			expect(rows.length).toBe(PRESSURES_BAR.length)
		},
	)
})
