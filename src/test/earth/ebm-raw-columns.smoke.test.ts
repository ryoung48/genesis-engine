import { writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const REPORT = "ebm-raw-columns.txt"
const NEWLINE = String.fromCharCode(10)
const NUM_LAT = CONSTANTS.embConstants.grid.NUM_LAT

// Earth's zonal land fraction per 5-degree band, south to north. Hardcoded so
// this probe needs no mesh — it isolates the EBM's own latitude x month output.
const EARTH_LAND_FRACTION = [
	0.95, 0.95, 0.9, 0.75, 0.55, 0.25, 0.06, 0.02, 0.02, 0.02, 0.03, 0.11, 0.23,
	0.24, 0.23, 0.22, 0.23, 0.24, 0.27, 0.31, 0.42, 0.47, 0.42, 0.39, 0.44, 0.52,
	0.57, 0.55, 0.5, 0.49, 0.57, 0.71, 0.71, 0.36, 0.15, 0.05,
]

describe("EBM raw latitude x month output", () => {
	it("dumps the land and ocean columns with no mesh involved", () => {
		const params = DEFAULT_WORLD_PARAMS
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

		const lines: string[] = []
		const bandLat = (i: number): number => -90 + (i + 0.5) * (180 / NUM_LAT)

		for (const [label, rows] of [
			["LAND column", ebm.temperature_land],
			["OCEAN column", ebm.temperature_ocean],
			["BLENDED column (what the climate preview renders)", ebm.temperature],
		] as const) {
			lines.push("")
			lines.push(`${label} — degrees C by latitude band and month`)
			lines.push(
				"  lat    Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec",
			)
			for (let i = 0; i < NUM_LAT; i++) {
				const vals = Array.from({ length: 12 }, (_, m) => monthMean(rows[i], m))
				lines.push(
					`${bandLat(i).toFixed(0).padStart(5)}  ${vals.map((v) => v.toFixed(1).padStart(5)).join(" ")}`,
				)
			}
			// Which band is warmest each month — this is what the TEQ argmax sees.
			const peak: string[] = []
			for (let m = 0; m < 12; m++) {
				let best = -Infinity
				let bestLat = 0
				for (let i = 0; i < NUM_LAT; i++) {
					const v = monthMean(rows[i], m)
					if (v > best) {
						best = v
						bestLat = bandLat(i)
					}
				}
				peak.push(`${bestLat.toFixed(0)}(${best.toFixed(1)})`)
			}
			lines.push(`  warmest band by month: ${peak.join(" ")}`)
		}

		// Area-weighted global mean of the land-fraction blend, plus the
		// tropical (|lat|<23.5) and polar means — separates "whole planet too
		// warm" from "gradient too flat".
		const cosw = (i: number) => Math.cos((bandLat(i) * Math.PI) / 180)
		let gW = 0
		let gT = 0
		let tW = 0
		let tT = 0
		let pW = 0
		let pT = 0
		for (let i = 0; i < NUM_LAT; i++) {
			const annual =
				ebm.temperature[i].reduce((a, b) => a + b, 0) /
				ebm.temperature[i].length
			const w = cosw(i)
			gW += w
			gT += annual * w
			if (Math.abs(bandLat(i)) < 23.5) {
				tW += w
				tT += annual * w
			}
			if (Math.abs(bandLat(i)) > 60) {
				pW += w
				pT += annual * w
			}
		}
		lines.push("")
		lines.push(
			`area-weighted global mean ${(gT / gW).toFixed(1)}C   (Earth ~14.0)`,
		)
		lines.push(
			`tropical mean |lat|<23.5   ${(tT / tW).toFixed(1)}C   (Earth ~26.0)`,
		)
		lines.push(
			`polar mean |lat|>60        ${(pT / pW).toFixed(1)}C   (Earth ~-16.0)`,
		)

		writeFileSync(REPORT, lines.join(NEWLINE))
		expect(ebm.temperature_land.length).toBe(NUM_LAT)
	}, 600_000)
})
