import { writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model"

const REPORT = "preview-temp-sweep.txt"
const NEWLINE = String.fromCharCode(10)
const NUM_LAT = CONSTANTS.embConstants.grid.NUM_LAT

// Mirrors useEbmPreview's config for an Earth-like generated world.
function previewAvgTemp(params: { albedo: number; greenhouseFactor: number }): {
	avg: number
	min: number
	max: number
} {
	const model = new EnergyBalanceModel({
		orbital: { OBLIQUITY: 23.44, ECCENTRICITY: 0.0167, PERIHELION: 102.9 },
		stellar: { ...CONSTANTS.embConstants.stellar },
		time: { HOURS_PER_DAY: 24, YEAR_LENGTH_DAYS: 365 },
		landFraction: new Array(NUM_LAT).fill(0.3),
		radius: 6371 * 1000,
		pressure: 1,
		albedo: params.albedo,
		greenhouseFactor: params.greenhouseFactor,
	})
	model.runModel({ years: 30, dtDays: 0.5 })
	let weighted = 0
	let area = 0
	let min = Infinity
	let max = -Infinity
	for (let i = 0; i < NUM_LAT; i++) {
		const row = model.temperature[i]
		const mean = row.reduce((a, b) => a + b, 0) / row.length
		weighted += mean * model.dx[i]
		area += model.dx[i]
		for (const v of row) {
			if (v < min) min = v
			if (v > max) max = v
		}
	}
	return { avg: weighted / area, min, max }
}

describe("Climate preview temperature sweep", () => {
	it("shows what albedo and greenhouse each buy", () => {
		const baseGreenhouse = CONSTANTS.embConstants.surface.GREENHOUSE_FACTOR
		const lines: string[] = []
		lines.push(`current GREENHOUSE_FACTOR ${baseGreenhouse.toFixed(4)}`)
		lines.push("")
		lines.push("albedo sweep (greenhouse held)")
		lines.push("  albedo    min     avg     max")
		for (const albedo of [0.3, 0.305, 0.31, 0.313, 0.32]) {
			const r = previewAvgTemp({ albedo, greenhouseFactor: baseGreenhouse })
			lines.push(
				`  ${albedo.toFixed(3)}  ${r.min.toFixed(1).padStart(6)}  ${r.avg.toFixed(1).padStart(6)}  ${r.max.toFixed(1).padStart(6)}`,
			)
		}
		lines.push("")
		lines.push("greenhouse sweep (albedo 0.30, this world's rolled value)")
		lines.push("  green     min     avg     max")
		for (const g of [0.7005, 0.69, 0.68, 0.675, 0.67, 0.66]) {
			const r = previewAvgTemp({ albedo: 0.3, greenhouseFactor: g })
			lines.push(
				`  ${g.toFixed(4)}  ${r.min.toFixed(1).padStart(6)}  ${r.avg.toFixed(1).padStart(6)}  ${r.max.toFixed(1).padStart(6)}`,
			)
		}
		writeFileSync(REPORT, lines.join(NEWLINE))
		expect(lines.length).toBeGreaterThan(0)
	}, 600_000)
})
