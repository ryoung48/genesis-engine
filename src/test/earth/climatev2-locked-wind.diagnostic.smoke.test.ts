import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { WIND } from "@/model/climate/weather/tidal-locked"
import { CLIMATE_V2 } from "@/model/climatev2"
import type { GenesisParams } from "@/model/pipelines/types"
import { CLIMATE_EARTH } from "./fixtures/climate-earth"

const PRESSURES_BAR = [0.1, 0.25, 0.5, 1, 2, 5, 10]
const BANDS = 6

describe("locked winds (diagnostic)", () => {
	it(
		"reports surface wind speed and pressure drop by angle from the substellar point",
		{ timeout: 1_800_000 },
		() => {
			const world = CLIMATE_EARTH.importWorld()
			const { mesh } = world
			const N = mesh.numRegions
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
				const temperatureMonthly = CLIMATE_V2.computeLocked({
					mesh,
					elevationKm: world.elevation_km,
					isLand: world.isLand,
					params,
				}).temperatureMonthly
				const avg = new Float32Array(N)
				for (let r = 0; r < N; r++) {
					for (let m = 0; m < 12; m++)
						avg[r] += temperatureMonthly[m * N + r] / 12
				}
				const wind = WIND.computeLockedWindVectors({
					mesh,
					climate: {
						temperature_monthly: temperatureMonthly,
						temperature_avg: avg,
					} as never,
					elevation_km: world.elevation_km,
					params,
				})
				const speed = new Float64Array(BANDS)
				const count = new Float64Array(BANDS)
				for (let r = 0; r < N; r++) {
					const angle =
						(Math.acos(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r]))) * 180) /
						Math.PI
					const b = Math.min(BANDS - 1, Math.floor(angle / 30))
					speed[b] += wind.windSpeed[r]
					count[b]++
				}
				let lo = Infinity
				let hi = -Infinity
				for (const p of wind.pressure) {
					lo = Math.min(lo, p)
					hi = Math.max(hi, p)
				}
				const sorted = Float64Array.from(wind.windSpeed).sort()
				const at = (q: number) =>
					Number(sorted[Math.floor(q * (N - 1))].toFixed(1))
				let top = 0
				for (let r = 0; r < N; r++)
					if (wind.windSpeed[r] > wind.windSpeed[top]) top = r
				return {
					speedPercentiles: [at(0.1), at(0.5), at(0.9), at(0.99), at(1)],
					fastest: {
						lat: Number(
							((Math.asin(mesh.r_xyz[3 * top + 2]) * 180) / Math.PI).toFixed(0),
						),
						cosTheta: Number(mesh.r_xyz[3 * top].toFixed(2)),
						elevationKm: Number(world.elevation_km[top].toFixed(2)),
					},
					pressureBar: pressure,
					pressureRangeHPa: [Number(lo.toFixed(1)), Number(hi.toFixed(1))],
					meanSpeedMsByAngle: Array.from(speed, (v, i) =>
						Number((v / count[i]).toFixed(1)),
					),
				}
			})
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = path.join("stats", "climate", `${stamp}-locked-wind`)
			fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(
				path.join(dir, "results.json"),
				JSON.stringify(rows, null, 2),
			)
			expect(rows.length).toBe(PRESSURES_BAR.length)
		},
	)
})
