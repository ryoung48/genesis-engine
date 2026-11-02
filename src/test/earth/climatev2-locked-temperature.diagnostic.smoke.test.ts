import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { CLIMATE_V2 } from "@/model/climatev2"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import type { GenesisParams, GenesisWorld } from "@/model/pipelines/types"
import { CLIMATE_EARTH } from "./fixtures/climate-earth"

const PRESSURES_BAR = [0.1, 0.25, 0.5, 1, 2, 5, 10]

interface Case {
	label: string
	spectralClass: GenesisParams["spectralClass"]
	starSubtype: number
	periodDays: number | null
	pressure: number
}

function lockedParams({
	base,
	spec,
	distanceAU,
	periodDays,
}: {
	base: GenesisParams
	spec: Case
	distanceAU: number
	periodDays: number
}): GenesisParams {
	return {
		...base,
		tideLock: { type: "solar", target: 0 },
		substellarLon: 0,
		obliquity: 0,
		eccentricity: 0,
		spectralClass: spec.spectralClass,
		starSubtype: spec.starSubtype,
		orbitalDistanceAU: distanceAU,
		daysPerYear: 1,
		hoursPerDay: periodDays * 24,
		pressure: spec.pressure,
	}
}

function summarize({
	world,
	temperatureMonthly,
}: {
	world: GenesisWorld
	temperatureMonthly: Float32Array
}) {
	const { mesh } = world
	const N = mesh.numRegions
	const sums = { day: 0, night: 0, all: 0, dayArea: 0, nightArea: 0, area: 0 }
	const band = [0, 0, 0, 0, 0, 0]
	const bandArea = [0, 0, 0, 0, 0, 0]
	let substellar = Number.NaN
	let antistellar = Number.NaN
	let bestSub = -1
	let bestAnti = 1
	for (let r = 0; r < N; r++) {
		let t = 0
		for (let m = 0; m < 12; m++) t += temperatureMonthly[m * N + r] / 12
		const cosTheta = mesh.r_xyz[3 * r]
		const area = mesh.regionArea[r]
		sums.all += t * area
		sums.area += area
		if (cosTheta > 0) {
			sums.day += t * area
			sums.dayArea += area
		} else {
			sums.night += t * area
			sums.nightArea += area
		}
		const angle =
			(Math.acos(Math.max(-1, Math.min(1, cosTheta))) * 180) / Math.PI
		const b = Math.min(5, Math.floor(angle / 30))
		band[b] += t * area
		bandArea[b] += area
		if (cosTheta > bestSub) {
			bestSub = cosTheta
			substellar = t
		}
		if (cosTheta < bestAnti) {
			bestAnti = cosTheta
			antistellar = t
		}
	}
	const r1 = (v: number) => Number(v.toFixed(1))
	return {
		globalMeanC: r1(sums.all / sums.area),
		daysideMeanC: r1(sums.day / sums.dayArea),
		nightsideMeanC: r1(sums.night / sums.nightArea),
		substellarC: r1(substellar),
		antistellarC: r1(antistellar),
		meanByAngleFromSubstellarC: band.map((v, i) => r1(v / bandArea[i])),
	}
}

describe("climatev2 locked temperature (diagnostic)", () => {
	it(
		"sweeps surface pressure on Earth's terrain for a Sun-like host",
		{ timeout: 1_800_000 },
		() => {
			const world = CLIMATE_EARTH.importWorld()
			const cases: Case[] = []
			for (const pressure of PRESSURES_BAR) {
				cases.push({
					label: "Sun, 1 AU, locked",
					spectralClass: "G",
					starSubtype: 2,
					periodDays: null,
					pressure,
				})
			}
			const rows = cases.map((spec) => {
				const probe = lockedParams({
					base: world.params,
					spec,
					distanceAU: 1,
					periodDays: 365,
				})
				const sunScale = CLIMATEV2_ORBIT.fromParams(probe).sunScale
				const distanceAU = Math.sqrt(sunScale)
				const periodDays = 365 * Math.sqrt(distanceAU ** 3 / 1)
				const params = lockedParams({
					base: world.params,
					spec,
					distanceAU,
					periodDays,
				})
				const temperatureMonthly = CLIMATE_V2.computeLockedTemperature({
					mesh: world.mesh,
					elevationKm: world.elevation_km,
					isLand: world.isLand,
					params,
				})
				return {
					label: spec.label,
					pressureBar: spec.pressure,
					distanceAU: Number(distanceAU.toFixed(3)),
					periodDays: Number(periodDays.toFixed(1)),
					...summarize({ world, temperatureMonthly }),
				}
			})
			const rotating = (process.env.SWEEP_ROTATING ? PRESSURES_BAR : []).map(
				(pressure) => {
					const cells = CLIMATE_V2.computeCellClimate({
						mesh: world.mesh,
						elevationKm: world.elevation_km,
						isLand: world.isLand,
						orbit: CLIMATEV2_ORBIT.fromParams({ ...world.params, pressure }),
						seed: world.params.seed,
						diagnostics: false,
					})
					return {
						label: "rotating Earth day",
						pressureBar: pressure,
						globalMeanC: summarize({
							world,
							temperatureMonthly: cells.temperatureMonthly,
						}).globalMeanC,
					}
				},
			)
			rows.push(...(rotating as unknown as typeof rows))
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = path.join("stats", "climate", `${stamp}-locked-temperature`)
			fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(
				path.join(dir, "results.json"),
				JSON.stringify(rows, null, 2),
			)
			expect(rows.length).toBe(cases.length + rotating.length)
		},
	)
})
