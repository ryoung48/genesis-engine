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

	it("walks land at 0.7 kilometres per year times suitability, speeding up smoothly from 10000 BCE to 50 kilometres per year times suitability at 1500", () => {
		const walk = (sourceArrival: number) =>
			MIGRATION.transit({
				sourceArrival,
				distanceKm: 100,
				meanSuitability: 0.5,
				destinationLandmassKm2: 1,
				corridorBonus: 1,
				kind: "land",
			}) - sourceArrival
		expect(walk(-20000)).toBeCloseTo(100 / 0.35)
		expect(walk(1600)).toBeCloseTo(100 / 25)
		let previous = walk(-12000)
		for (let year = -11000; year <= 1600; year += 1000) {
			expect(walk(year)).toBeLessThanOrEqual(previous)
			previous = walk(year)
		}
		expect(walk(-5000)).toBeLessThan(walk(-20000))
		expect(walk(-5000)).toBeGreaterThan(walk(1600))
	})

	it("opens longer crossings later along a continuous capability curve", () => {
		const sea = (distanceKm: number) =>
			MIGRATION.transit({
				sourceArrival: -64000,
				distanceKm,
				meanSuitability: 1,
				destinationLandmassKm2: 1,
				corridorBonus: 1,
				kind: "sea",
			})
		const open = (distanceKm: number) => sea(distanceKm) - 100 - distanceKm / 10
		expect(open(130)).toBeCloseTo(-64000)
		expect(open(185)).toBeCloseTo(-5000)
		expect(open(850)).toBeCloseTo(-1000)
		expect(open(3000)).toBeCloseTo(800)
		expect(open(10000)).toBeCloseTo(800)
		expect(open(131) - open(130)).toBeLessThan(500)
		expect(open(186) - open(185)).toBeLessThan(20)
		let previous = open(130)
		for (let d = 135; d <= 3000; d += 5) {
			expect(open(d)).toBeGreaterThanOrEqual(previous)
			previous = open(d)
		}
	})

	it("opens crossings to a large landmass earlier than to a small island", () => {
		const open = (destinationLandmassKm2: number) =>
			MIGRATION.transit({
				sourceArrival: -64000,
				distanceKm: 3000,
				meanSuitability: 1,
				destinationLandmassKm2,
				corridorBonus: 1,
				kind: "sea",
			}) -
			100 -
			300
		expect(open(1_000_000)).toBeCloseTo(800)
		expect(open(10_000_000)).toBeLessThan(open(1_000_000))
		expect(open(100_000_000)).toBeLessThan(open(10_000_000))
		expect(open(20_000)).toBeCloseTo(800)
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
		expect(result.arrivalYear[2]).toBeLessThanOrEqual(-65000 + 520)
	})

	it("does not walk province links that cross water at land speed", () => {
		const world = MIGRATION_FIXTURE.world({
			layout: "LLLL",
			stepDegrees: 0.5,
			habitability: [5, 5, 1, 1],
			horizonYear: 2025,
		})
		world.provinces.landmassId = Int32Array.of(0, 0, 1, 1)
		const result = MIGRATION.compute(world)
		for (const p of [2, 3]) {
			expect(result.arrivalYear[p]).toBe(MIGRATION.sentinel)
			expect(world.provinces.desolate[p]).toBe(0)
		}
	})

	it("leaves land beyond the horizon unreached without making it desolate", () => {
		const wide = MIGRATION_FIXTURE.world({
			layout: "LL####LL",
			stepDegrees: 15,
			habitability: [5, 5, 1, 1],
			horizonYear: 1000,
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
		expect(shelf.arrivalYear[2]).toBeLessThan(-50000)
		const deep = MIGRATION.compute(
			MIGRATION_FIXTURE.world({
				layout: "LL##LL",
				stepDegrees: 0.9,
				habitability: [5, 5, 1, 1],
				horizonYear: 2025,
			}),
		)
		expect(deep.edgeKind[2]).toBe(2)
		expect(deep.arrivalYear[2]).toBeGreaterThan(-6000)
	})

	it("is an ordinary sea link once the shelf has drowned", () => {
		const shelf = (sourceArrival: number) =>
			MIGRATION.transit({
				sourceArrival,
				distanceKm: 300,
				meanSuitability: 1,
				destinationLandmassKm2: 1,
				corridorBonus: 1,
				kind: "shelf",
			})
		const sea = (sourceArrival: number) =>
			MIGRATION.transit({
				sourceArrival,
				distanceKm: 300,
				meanSuitability: 1,
				destinationLandmassKm2: 1,
				corridorBonus: 1,
				kind: "sea",
			})
		expect(shelf(-9400)).toBe(sea(-9400))
		expect(shelf(-20000)).toBeCloseTo(-20000 + 300 / 0.7)
	})
})

describe("state-held core", () => {
	it("seeds a core at every best site a cradle spacing apart, across landmasses, and grows them together to the count", () => {
		const total = 202
		const world = MIGRATION_FIXTURE.world({
			layout: "L".repeat(total),
			stepDegrees: 0.5,
			habitability: new Array(total).fill(1),
			horizonYear: 2025,
		})
		world.provinces.landmassId = Int32Array.from({ length: total }, (_, p) =>
			p < 100 ? 0 : 1,
		)
		const mask = MIGRATION.heldCore({
			provinces: world.provinces,
			suitability: new Float64Array(total).fill(1),
			settled: new Uint8Array(total).fill(1),
			siteScore: Float32Array.from({ length: total }, (_, p) =>
				p === 150 ? 1 : 0.5,
			),
			activeCradles: [0],
			fallbackSource: 0,
			count: 60,
			r_xyz: world.mesh.r_xyz,
			planetRadiusKm: 6371,
		})
		expect(mask.reduce((sum, held) => sum + held, 0)).toBe(60)
		for (const seed of [0, 36, 72, 111, 150, 201]) expect(mask[seed]).toBe(1)
		for (const gap of [20, 55, 92, 130, 175]) expect(mask[gap]).toBe(0)
	})
})
