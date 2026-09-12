import { describe, expect, it } from "vitest"
import { GRID } from "@/model/climate/weather/wind/grid"
import { SHALLOW_WATER } from "@/model/climate/weather/wind/shallow-water"

function buildFixture() {
	const lonBins = 180
	const latBins = 90
	const cellCount = lonBins * latBins
	const latDeg = new Float32Array(cellCount)
	const lonDeg = new Float32Array(cellCount)
	const pressure = new Float32Array(cellCount)
	const elevation_km = new Float32Array(cellCount)
	for (let j = 0; j < latBins; j++) {
		const lat = -89 + j * 2
		for (let i = 0; i < lonBins; i++) {
			const idx = j * lonBins + i
			const lon = -179 + i * 2
			latDeg[idx] = lat
			lonDeg[idx] = lon
			pressure[idx] =
				Math.cos((lat * Math.PI) / 180) * Math.sin((lon * Math.PI) / 180)
		}
	}
	return { lonBins, latBins, cellCount, latDeg, lonDeg, pressure, elevation_km }
}

describe("shallow-water pressure response", () => {
	it("strengthens wind when the pressure response increases", () => {
		const { cellCount, latDeg, lonDeg, pressure, elevation_km } = buildFixture()

		const weaker = SHALLOW_WATER.surfaceWind({
			latDeg,
			lonDeg,
			pressure,
			elevation_km,
			planetRadiusM: 6.371e6,
			coriolisPolar: 1.458e-4,
			pressureScale: 0.5,
		})
		const stronger = SHALLOW_WATER.surfaceWind({
			latDeg,
			lonDeg,
			pressure,
			elevation_km,
			planetRadiusM: 6.371e6,
			coriolisPolar: 1.458e-4,
			pressureScale: 1,
		})
		let weakerSpeed = 0
		let strongerSpeed = 0
		for (let idx = 0; idx < cellCount; idx++) {
			weakerSpeed += Math.hypot(weaker.u[idx], weaker.v[idx])
			strongerSpeed += Math.hypot(stronger.u[idx], stronger.v[idx])
		}
		expect(strongerSpeed).toBeGreaterThan(weakerSpeed * 1.5)
		expect(strongerSpeed).toBeLessThan(weakerSpeed * 2.5)
		expect(stronger.steps).toBeLessThan(500)
	})

	it("diverts flow around a mountain range", () => {
		const { latDeg, lonDeg, pressure, elevation_km } = buildFixture()
		const flatElevation = elevation_km.slice()
		for (let idx = 0; idx < elevation_km.length; idx++) {
			const lat = latDeg[idx]
			const lon = lonDeg[idx]
			if (Math.abs(lat) <= 30 && Math.abs(lon) <= 5)
				elevation_km[idx] = 5 * (1 - Math.abs(lon) / 6)
		}
		const common = {
			latDeg,
			lonDeg,
			pressure,
			planetRadiusM: 6.371e6,
			coriolisPolar: 1.458e-4,
			pressureScale: 1,
		}
		const flat = SHALLOW_WATER.solveMonth({
			...common,
			elevation_km: flatElevation,
		}).state
		const ridge = SHALLOW_WATER.solveMonth({ ...common, elevation_km }).state
		const { lonBins, latBins } = ridge
		let flatCrossRange = 0
		let ridgeCrossRange = 0
		let flatAroundRange = 0
		let ridgeAroundRange = 0
		let crossSamples = 0
		let aroundSamples = 0
		for (let j = 0; j < latBins; j++) {
			const lat = -90 + (j + 0.5) * GRID.deg
			for (let i = 0; i < lonBins; i++) {
				const lon = -180 + (i + 0.5) * GRID.deg
				const idx = j * lonBins + i
				if (Math.abs(lat) <= 25 && Math.abs(lon) <= 5) {
					flatCrossRange += Math.abs(flat.u[idx])
					ridgeCrossRange += Math.abs(ridge.u[idx])
					crossSamples++
				}
				if (Math.abs(lat) >= 25 && Math.abs(lat) <= 40 && Math.abs(lon) <= 12) {
					flatAroundRange += Math.abs(flat.v[idx])
					ridgeAroundRange += Math.abs(ridge.v[idx])
					aroundSamples++
				}
			}
		}
		expect(ridgeCrossRange / crossSamples).toBeLessThan(
			(flatCrossRange / crossSamples) * 0.85,
		)
		expect(ridgeAroundRange / aroundSamples).toBeGreaterThan(
			(flatAroundRange / aroundSamples) * 1.05,
		)
	})
})
