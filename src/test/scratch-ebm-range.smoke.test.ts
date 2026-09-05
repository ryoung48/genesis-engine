import { describe, it } from "vitest"
import { MATH } from "@/model/shared/math/core"

const itczScale = (x: number) =>
	MATH.piecewise({ domain: [0, 0.15, 0.4, 1], range: [1, 1, 0.15, 0], x })
const subsidenceScale = (x: number) =>
	MATH.piecewise({ domain: [10 / 30, 18 / 30, 32 / 30, 40 / 30], range: [0, 0.85, 0.85, 0], x })
const eastStormScale = (x: number) =>
	MATH.piecewise({ domain: [0 / 30, 25 / 30, 80 / 30], range: [0, 0.8, 1], x })
const westerliesScale = (x: number) =>
	MATH.piecewise({ domain: [35 / 30, 40 / 30, 80 / 30], range: [0, 1, 0.8], x })
const hadley = 30

function computeWeight(
	cellLat: number,
	teq: number,
	subsidenceTeq: number,
	eastMoisture: number,
	westMoisture: number,
) {
	const dist = Math.abs(cellLat - teq) / hadley
	const subsidenceDist = Math.abs(cellLat - subsidenceTeq) / hadley
	const moisture = Math.max(eastMoisture, westMoisture)
	const itcz = itczScale(dist) * moisture
	const suppression = 1 - MATH.clamp({ value: subsidenceScale(subsidenceDist), lo: 0, hi: 1 })
	const eastStorms = eastStormScale(dist) * eastMoisture
	const westerlies = westerliesScale(dist) * westMoisture * suppression
	return MATH.clamp({ value: Math.max(itcz * suppression, eastStorms, westerlies), lo: 0, hi: 1 })
}

describe("scratch", () => {
	it("tabulates WEST-COAST-ONLY weight by lat/month (eastMoisture=0)", () => {
		for (const lat of [0, 10, 20, 30, 35, 40, 45, 50, 55, 60]) {
			const row: string[] = []
			for (let month = 0; month < 12; month++) {
				const teq = 23.5 * Math.sin((2 * Math.PI * (month - 2)) / 12)
				const w = computeWeight(lat, teq, 0, 0, 1)
				row.push(w.toFixed(2))
			}
			console.log(`lat=${lat}: ${row.join(" ")}`)
		}
	})
})
