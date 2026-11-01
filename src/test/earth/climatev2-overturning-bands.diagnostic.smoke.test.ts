import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import { CLIMATE_EARTH } from "./fixtures/climate-earth"

const EARTH_HOURS = 23.93447232
const SIDEREAL_DAYS_H = process.env.SWEEP_EARTH_ONLY
	? [EARTH_HOURS]
	: [96, 48, EARTH_HOURS, 12, 6]

describe("climatev2 overturning bands (diagnostic)", () => {
	it(
		"prints the derived overturning bands on Earth's terrain across rotation rates",
		{ timeout: 1_800_000 },
		() => {
			const world = CLIMATE_EARTH.importWorld()
			const base = CLIMATEV2_ORBIT.fromParams(world.params)
			const rows = SIDEREAL_DAYS_H.map((hours) => {
				const result = planetClimate(
					{
						xyz: world.mesh.r_xyz,
						elevKm: world.elevation_km,
						axes: "z-up",
						land: world.isLand,
					},
					{
						...base,
						rotationRateRadS: base.rotationRateRadS * (EARTH_HOURS / hours),
						seed: world.params.seed,
						greenhouseWm2: 0,
						onCell: () => undefined,
					},
				)
				const bands = result.stages.ocean.overturning.map((band) => ({
					hemisphere: band.hemisphere === 1 ? "N" : "S",
					from: Number(band.fromLat.toFixed(1)),
					full: Number(band.fullLat.toFixed(1)),
					polar: Number(band.polarLat.toFixed(1)),
					transportPW: Number(band.transportPW.toFixed(2)),
					heatPW: Number(band.heatPW.toFixed(2)),
				}))
				const { grid } = result
				const moc = result.stages.ocean.qOverturning
				const ice = result.stages.temperature.seaIce
				const profile: {
					lat: number
					atlanticMocWm2: number
					atlanticIceShare: number
					mocWm2: number
				}[] = []
				for (let lat = 35; lat < 90; lat += 5) {
					let atl = 0
					let atlIce = 0
					let atlN = 0
					let all = 0
					let allN = 0
					for (let j = 0; j < grid.h; j++) {
						if (grid.lat[j] < lat || grid.lat[j] >= lat + 5) continue
						for (let i = 0; i < grid.w; i++) {
							const c = j * grid.w + i
							if (result.surface.landFrac[c] >= 0.5) continue
							all += moc[c]
							allN++
							if (grid.lon[i] < -60 || grid.lon[i] > 20) continue
							atl += moc[c]
							let share = 0
							for (let m = 0; m < 12; m++)
								share += Math.min(1, ice[m * grid.size + c]) / 12
							atlIce += share
							atlN++
						}
					}
					profile.push({
						lat,
						atlanticMocWm2: Number((atl / Math.max(1, atlN)).toFixed(1)),
						atlanticIceShare: Number((atlIce / Math.max(1, atlN)).toFixed(2)),
						mocWm2: Number((all / Math.max(1, allN)).toFixed(1)),
					})
				}
				return {
					siderealDayHours: hours,
					bands,
					profile: hours === EARTH_HOURS ? profile : [],
				}
			})
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = path.join("stats", "climate", `${stamp}-overturning-bands`)
			fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(
				path.join(dir, "results.json"),
				JSON.stringify(rows, null, 2),
			)
			expect(rows.length).toBe(SIDEREAL_DAYS_H.length)
		},
	)
})
