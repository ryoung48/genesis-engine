import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { CLIMATE_V2 } from "@/model/climatev2"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { lockedClimate } from "@/model/climatev2/vendor/climate.js"
import type { GenesisParams } from "@/model/pipelines/types"
import { CLIMATE_EARTH } from "./fixtures/climate-earth"

const PRESSURES_BAR = [1, 5]
const noCell = (): void => undefined

describe("climatev2 locked energy budget (diagnostic)", () => {
	it(
		"compares locked and rotating radiation budgets",
		{ timeout: 1_800_000 },
		() => {
			const world = CLIMATE_EARTH.importWorld()
			const rows = PRESSURES_BAR.flatMap((pressure) => {
				const lockedParams: GenesisParams = {
					...world.params,
					tideLock: { type: "solar", target: 0 },
					substellarLon: 0,
					obliquity: 0,
					eccentricity: 0,
					daysPerYear: 1,
					hoursPerDay: 365 * 24,
					pressure,
				}
				const locked = lockedClimate(
					{
						xyz: world.mesh.r_xyz,
						elevKm: world.elevation_km,
						axes: "z-up",
						land: world.isLand,
					},
					{
						...CLIMATEV2_ORBIT.lockedFromParams(lockedParams),
						seed: world.params.seed,
						greenhouseWm2: 0,
						onCell: noCell,
					},
				)
				const rotating = CLIMATE_V2.computeCellClimate({
					mesh: world.mesh,
					elevationKm: world.elevation_km,
					isLand: world.isLand,
					orbit: CLIMATEV2_ORBIT.fromParams({ ...world.params, pressure }),
					seed: world.params.seed,
					diagnostics: true,
				})
				const scalars = (b: typeof locked.stages.temperature.budget) => ({
					sunWm2: b.sunWm2,
					air: b.air,
					ground: b.ground,
					snowIce: b.snowIce,
					cloud: b.cloud,
					cloudLongwaveWm2: b.cloudLongwaveWm2,
				})
				const meanNet = (b: typeof locked.stages.temperature.budget) => {
					let sum = 0
					let weight = 0
					b.rowLat.forEach((lat, j) => {
						const w = Math.cos((lat * Math.PI) / 180)
						sum += b.rowNetWm2[j] * w
						weight += w
					})
					return sum / weight
				}
				const meanT = (r: typeof locked) => {
					const { grid } = r
					const field = r.stages.temperature.monthlySL
					let sum = 0
					let weight = 0
					for (let m = 0; m < 12; m++)
						for (let j = 0; j < grid.h; j++) {
							const w = Math.cos((grid.lat[j] * Math.PI) / 180)
							for (let i = 0; i < grid.w; i++) {
								sum += field[m * grid.size + j * grid.w + i] * w
								weight += w
							}
						}
					return sum / weight
				}
				return [
					{
						pressure,
						kind: "locked",
						meanC: meanT(locked),
						netMeanWm2: meanNet(locked.stages.temperature.budget),
						...scalars(locked.stages.temperature.budget),
					},
					{
						pressure,
						kind: "rotating",
						netMeanWm2: meanNet(
							rotating.diagnostics
								?.radiation as typeof locked.stages.temperature.budget,
						),
						...scalars(
							rotating.diagnostics
								?.radiation as typeof locked.stages.temperature.budget,
						),
					},
				]
			})
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = path.join("stats", "climate", `${stamp}-locked-budget`)
			fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(
				path.join(dir, "results.json"),
				JSON.stringify(rows, null, 2),
			)
			expect(rows.length).toBe(PRESSURES_BAR.length * 2)
		},
	)
})
