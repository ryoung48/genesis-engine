import { writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const REPORT = "ebm-diffusion-sweep.txt"
const NEWLINE = String.fromCharCode(10)
const NUM_LAT = CONSTANTS.embConstants.grid.NUM_LAT

const EARTH_LAND_FRACTION = [
	0.95, 0.95, 0.9, 0.75, 0.55, 0.25, 0.06, 0.02, 0.02, 0.02, 0.03, 0.11, 0.23,
	0.24, 0.23, 0.22, 0.23, 0.24, 0.27, 0.31, 0.42, 0.47, 0.42, 0.39, 0.44, 0.52,
	0.57, 0.55, 0.5, 0.49, 0.57, 0.71, 0.71, 0.36, 0.15, 0.05,
]

const bandLat = (i: number): number => -90 + (i + 0.5) * (180 / NUM_LAT)

describe("EBM diffusion coefficient sweep", () => {
	it("shows how tropical gradient and pole-equator spread trade off", () => {
		const params = DEFAULT_WORLD_PARAMS
		const lines: string[] = []

		for (const coefficient of [0.44, 0.3, 0.2, 0.12, 0.06]) {
			// DIFFUSION_COEFFICIENT is `private static readonly`, which is a
			// compile-time contract only — the runtime property is writable, so an
			// experiment can sweep it without changing the shipped default.
			;(
				EnergyBalanceModel as unknown as { DIFFUSION_COEFFICIENT: number }
			).DIFFUSION_COEFFICIENT = coefficient

			const ebm = new EnergyBalanceModel({
				orbital: {
					OBLIQUITY: params.obliquity,
					ECCENTRICITY: params.eccentricity,
					PERIHELION: params.perihelion,
				},
				stellar: { ...CONSTANTS.embConstants.stellar },
				time: {
					YEAR_LENGTH_DAYS: params.daysPerYear,
					HOURS_PER_DAY: params.hoursPerDay,
				},
				pressure: params.pressure ?? 1.0,
				landFraction: EARTH_LAND_FRACTION,
			})
			ebm.runModel({ years: 30, dtDays: 0.5 })

			const steps = ebm.temperature_land[0].length
			const perMonth = steps / 12
			const monthMean = (row: number[], month: number): number => {
				let sum = 0
				let n = 0
				for (
					let i = Math.floor(month * perMonth);
					i < Math.floor((month + 1) * perMonth);
					i++
				) {
					sum += row[i]
					n++
				}
				return sum / Math.max(1, n)
			}
			const annualMean = (row: number[]): number => {
				let sum = 0
				for (const v of row) sum += v
				return sum / row.length
			}

			const peak: string[] = []
			for (let month = 0; month < 12; month++) {
				let best = -Infinity
				let bestLat = 0
				for (let i = 0; i < NUM_LAT; i++) {
					const v = monthMean(ebm.temperature_land[i], month)
					if (v > best) {
						best = v
						bestLat = bandLat(i)
					}
				}
				peak.push(`${bestLat.toFixed(0).padStart(3)}`)
			}

			// July land: how much hotter is the hottest band than the equator?
			const nearest = (lat: number): number => {
				let bestIdx = 0
				let bestErr = Infinity
				for (let i = 0; i < NUM_LAT; i++) {
					const err = Math.abs(bandLat(i) - lat)
					if (err < bestErr) {
						bestErr = err
						bestIdx = i
					}
				}
				return bestIdx
			}
			const julEq = monthMean(ebm.temperature_land[nearest(0)], 6)
			let julMax = -Infinity
			for (let i = 0; i < NUM_LAT; i++) {
				julMax = Math.max(julMax, monthMean(ebm.temperature_land[i], 6))
			}
			const eqAnnual = annualMean(ebm.temperature_land[nearest(0)])
			const poleAnnual = annualMean(ebm.temperature_land[nearest(88)])

			lines.push(
				`diffusion ${coefficient.toFixed(2)}  |  July land: eq ${julEq.toFixed(1)}C  peak ${julMax.toFixed(1)}C  tropical contrast ${(julMax - julEq).toFixed(1)}C  |  annual eq-pole spread ${(eqAnnual - poleAnnual).toFixed(1)}C`,
			)
			lines.push(`             land peak track: ${peak.join(" ")}`)
		}

		lines.push("")
		lines.push(
			"Earth reference: July zonal land contrast ~10C; eq-pole spread ~50C",
		)

		writeFileSync(REPORT, lines.join(NEWLINE))
		expect(lines.length).toBeGreaterThan(0)
	}, 600_000)
})
