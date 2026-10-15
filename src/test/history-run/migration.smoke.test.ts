import { describe, expect, it } from "vitest"
import { MIGRATION } from "@/model/society/migration"
import { MIGRATION_FIXTURE } from "@/test/history-run/fixtures/migration"

const START = MIGRATION.startYear

describe("arrival field", () => {
	it("settles one origin and every later province strictly after its predecessor", () => {
		const world = MIGRATION_FIXTURE.world({
			layout: "LLLLLL",
			stepDegrees: 0.5,
			habitability: [1, 1, 1, 1, 1, 1],
			horizonYear: 2025,
		})
		const result = MIGRATION.compute(world)
		const origins = [...result.arrivalYear].filter((year) => year === START)
		expect(origins).toHaveLength(1)
		for (let p = 0; p < world.provinces.count; p++) {
			if (p === result.origin) continue
			expect(result.arrivalYear[p]).toBeGreaterThan(
				result.arrivalYear[result.predecessor[p]],
			)
		}
	})

	it("walks land at one kilometre per year times suitability, and fifty times that after 1500", () => {
		const early = MIGRATION.transit({
			sourceArrival: -1000,
			distanceKm: 100,
			meanSuitability: 0.5,
			corridorBonus: 1,
			kind: "land",
		})
		expect(early).toBe(-800)
		const late = MIGRATION.transit({
			sourceArrival: 1600,
			distanceKm: 100,
			meanSuitability: 0.5,
			corridorBonus: 1,
			kind: "land",
		})
		expect(late).toBe(1604)
		const crossing = MIGRATION.transit({
			sourceArrival: 1400,
			distanceKm: 100,
			meanSuitability: 0.5,
			corridorBonus: 1,
			kind: "land",
		})
		expect(crossing).toBe(1502)
	})

	it("opens each sea tier at its capability year", () => {
		const sea = (distanceKm: number) =>
			MIGRATION.transit({
				sourceArrival: -50000,
				distanceKm,
				meanSuitability: 1,
				corridorBonus: 1,
				kind: "sea",
			})
		expect(sea(150)).toBeCloseTo(-50000 + 100 + 15)
		expect(sea(151)).toBeCloseTo(-2999 + 100 + 15.1)
		expect(sea(500)).toBeCloseTo(-2999 + 100 + 50)
		expect(sea(501)).toBeCloseTo(-999 + 100 + 50.1)
		expect(sea(2000)).toBeCloseTo(-999 + 100 + 200)
		expect(sea(2001)).toBeCloseTo(1500 + 100 + 200.1)
	})

	it("hops a 75 km strait at once", () => {
		const world = MIGRATION_FIXTURE.world({
			layout: "LL#LL",
			stepDegrees: 0.3369,
			habitability: [5, 5, 1, 1],
			horizonYear: 2025,
		})
		const result = MIGRATION.compute(world)
		expect(result.predecessor[2]).toBe(1)
		expect(result.edgeKind[2]).toBe(2)
		expect(result.arrivalTier[2]).toBe(1)
		expect(result.arrivalYear[2] - result.arrivalYear[1]).toBeLessThanOrEqual(
			109,
		)
	})

	it("leaves land beyond the horizon unreached without making it desolate", () => {
		const wide = MIGRATION_FIXTURE.world({
			layout: "LL####LL",
			stepDegrees: 9,
			habitability: [5, 5, 1, 1],
			horizonYear: 2025,
		})
		const result = MIGRATION.compute(wide)
		for (const p of [2, 3]) {
			expect(result.arrivalYear[p]).toBe(MIGRATION.sentinel)
			expect(result.migrationWave[p]).toBe(-1)
			expect(wide.provinces.desolate[p]).toBe(0)
		}
	})

	it("scales suitability by the 95th percentile so one outlier does not slow the world", () => {
		const habitability = Array.from({ length: 20 }, (_, i) =>
			i === 19 ? 100 : 1,
		)
		const world = MIGRATION_FIXTURE.world({
			layout: "L".repeat(20),
			stepDegrees: 0.5,
			habitability,
			horizonYear: 2025,
		})
		const result = MIGRATION.compute(world)
		expect(result.diagnostics.suitabilityScale).toBe(1)
		expect(result.suitability[0]).toBe(1)
		expect(result.suitability[19]).toBe(1)
	})
})

describe("shelf links", () => {
	it("crosses a 300 km shelf at land speed before 9500 BCE", () => {
		const shelf = MIGRATION.compute(
			MIGRATION_FIXTURE.world({
				layout: "LL~~LL",
				stepDegrees: 0.9,
				habitability: [5, 5, 1, 1],
				horizonYear: 2025,
			}),
		)
		expect(shelf.edgeKind[2]).toBe(3)
		expect(shelf.arrivalYear[2]).toBeLessThan(-70000)
		const deep = MIGRATION.compute(
			MIGRATION_FIXTURE.world({
				layout: "LL##LL",
				stepDegrees: 0.9,
				habitability: [5, 5, 1, 1],
				horizonYear: 2025,
			}),
		)
		expect(deep.edgeKind[2]).toBe(2)
		expect(deep.arrivalYear[2]).toBeGreaterThanOrEqual(-2999)
	})

	it("is an ordinary sea link once the shelf has drowned", () => {
		const shelf = (sourceArrival: number) =>
			MIGRATION.transit({
				sourceArrival,
				distanceKm: 300,
				meanSuitability: 1,
				corridorBonus: 1,
				kind: "shelf",
			})
		const sea = (sourceArrival: number) =>
			MIGRATION.transit({
				sourceArrival,
				distanceKm: 300,
				meanSuitability: 1,
				corridorBonus: 1,
				kind: "sea",
			})
		expect(shelf(-9400)).toBe(sea(-9400))
		expect(shelf(-20000)).toBe(-19700)
	})
})
