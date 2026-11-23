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
		const result = MIGRATION.compute(world).result
		const origins = [...result.arrivalYear].filter((year) => year === START)
		expect(origins).toHaveLength(1)
		for (let p = 0; p < world.provinces.count; p++) {
			if (p === result.origin) continue
			expect(result.arrivalYear[p]).toBeGreaterThan(
				result.arrivalYear[result.predecessor[p]],
			)
		}
	})

	it("walks land at 0.55 kilometres per year times a speed factor of 0.3 plus 0.7 times suitability, speeding up smoothly from 10000 BCE to 50 kilometres per year times that factor at 1500", () => {
		const walk = (sourceArrival: number) =>
			MIGRATION.transit({
				sourceArrival,
				sourceOriginKm: 0,
				distanceKm: 100,
				meanSuitability: 0.5,
				destinationLandmassKm2: 1,
				corridorBonus: 1,
				kind: "land",
			}) - sourceArrival
		expect(walk(-20000)).toBeCloseTo(100 / (0.55 * 0.65))
		expect(walk(1600)).toBeCloseTo(100 / (50 * 0.65))
		let previous = walk(-12000)
		for (let year = -11000; year <= 1600; year += 1000) {
			expect(walk(year)).toBeLessThanOrEqual(previous)
			previous = walk(year)
		}
		expect(walk(-5000)).toBeLessThan(walk(-20000))
		expect(walk(-5000)).toBeGreaterThan(walk(1600))
	})

	it("lets departures inside the homeland radius leave before the dispersal year", () => {
		const walk = (sourceOriginKm: number) =>
			MIGRATION.transit({
				sourceArrival: -75000,
				sourceOriginKm,
				distanceKm: 100,
				meanSuitability: 1,
				destinationLandmassKm2: 1,
				corridorBonus: 1,
				kind: "land",
			})
		expect(walk(500)).toBeCloseTo(-75000 + 100 / 0.55)
		expect(walk(5000)).toBeCloseTo(-65000 + 100 / 0.55)
	})

	it("opens longer crossings later along a continuous capability curve", () => {
		const sea = (distanceKm: number) =>
			MIGRATION.transit({
				sourceArrival: -64000,
				sourceOriginKm: 0,
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
				sourceOriginKm: 0,
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
		const result = MIGRATION.compute(world).result
		expect(result.predecessor[2]).toBe(1)
		expect(result.edgeKind[2]).toBe(2)
		expect(result.arrivalTier[2]).toBe(1)
		expect(result.arrivalYear[2]).toBeGreaterThan(-11700)
	})

	it("ramps the arrival order evenly from the dispersal year to 1300 without touching arrival years", () => {
		const world = MIGRATION_FIXTURE.world({
			layout: "L".repeat(12),
			stepDegrees: 0.5,
			habitability: new Array<number>(12).fill(1),
			horizonYear: 2025,
		})
		const result = MIGRATION.compute(world).result
		const ramp = MIGRATION.rampYears({
			arrivalYear: result.arrivalYear,
			desolate: world.provinces.desolate,
		})
		const years = [...result.order].map((p) => ramp[p])
		expect(years[0]).toBe(MIGRATION.startYear)
		expect(years[1]).toBe(-65000)
		expect(years[years.length - 1]).toBe(1300)
		const gaps = years.slice(2).map((year, i) => year - years[i + 1])
		for (const gap of gaps)
			expect(Math.abs(gap - gaps[0])).toBeLessThanOrEqual(1)
		expect(result.arrivalYear[result.order[1]]).not.toBe(ramp[result.order[1]])
	})

	it("traces trunk routes from the origin along the heaviest branches and dates their tips", () => {
		const world = MIGRATION_FIXTURE.world({
			layout: "L".repeat(40),
			stepDegrees: 0.5,
			habitability: new Array<number>(40).fill(1),
			horizonYear: 2025,
		})
		const result = MIGRATION.compute(world).result
		const { trunks, milestones } = MIGRATION.routes({
			provinces: world.provinces,
			r_xyz: world.mesh.r_xyz,
			arrivalYear: result.arrivalYear,
			predecessor: result.predecessor,
		})
		expect(trunks.length).toBeGreaterThan(0)
		expect(trunks[0].provinces[0]).toBe(result.origin)
		for (const trunk of trunks)
			for (let i = 1; i < trunk.provinces.length; i++)
				expect(result.predecessor[trunk.provinces[i]]).toBe(
					trunk.provinces[i - 1],
				)
		expect(milestones.some((m) => m.province === result.origin)).toBe(true)
		for (const m of milestones)
			expect(m.year).toBe(result.arrivalYear[m.province])
	})

	it("does not walk province links that cross water at land speed", () => {
		const world = MIGRATION_FIXTURE.world({
			layout: "LLLL",
			stepDegrees: 0.5,
			habitability: [5, 5, 1, 1],
			horizonYear: 2025,
		})
		world.provinces.landmassId = Int32Array.of(0, 0, 1, 1)
		const result = MIGRATION.compute(world).result
		for (const p of [2, 3]) {
			expect(result.arrivalYear[p]).toBe(MIGRATION.sentinel)
			expect(world.provinces.desolate[p]).toBe(0)
		}
	})

	it("crosses a desolate strip without settling it, more slowly than open land", () => {
		const build = (desolate: boolean) => {
			const world = MIGRATION_FIXTURE.world({
				layout: "LLLLL",
				stepDegrees: 0.5,
				habitability: [5, 5, 5, 5, 5],
				horizonYear: 2025,
			})
			if (desolate) {
				world.provinces.desolate[2] = 1
				world.provinces.landmassId = Int32Array.of(0, 0, -1, 1, 1)
			}
			return MIGRATION.compute({
				...world,
				originHint: { lonDeg: 0, latDeg: 0 },
			}).result
		}
		const open = build(false)
		const strip = build(true)
		expect(strip.origin).toBe(0)
		expect(strip.arrivalYear[2]).toBe(MIGRATION.sentinel)
		expect(strip.continuousArrival[2]).toBe(Infinity)
		for (const p of [3, 4]) {
			expect(strip.arrivalYear[p]).not.toBe(MIGRATION.sentinel)
			expect(strip.arrivalYear[p]).toBeGreaterThan(open.arrivalYear[p])
		}
		expect(strip.predecessor[3]).toBe(1)
		expect(strip.edgeKind[3]).toBe(1)
		expect(strip.order).not.toContain(2)
	})

	it("leaves land beyond the horizon unreached without making it desolate", () => {
		const wide = MIGRATION_FIXTURE.world({
			layout: "LL####LL",
			stepDegrees: 15,
			habitability: [5, 5, 1, 1],
			horizonYear: 1000,
		})
		const result = MIGRATION.compute(wide).result
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
		const result = MIGRATION.compute(world).result
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
		).result
		expect(shelf.edgeKind[2]).toBe(3)
		expect(shelf.arrivalYear[2]).toBeGreaterThan(-11700)
		const deep = MIGRATION.compute(
			MIGRATION_FIXTURE.world({
				layout: "LL##LL",
				stepDegrees: 0.9,
				habitability: [5, 5, 1, 1],
				horizonYear: 2025,
			}),
		).result
		expect(deep.edgeKind[2]).toBe(2)
		expect(deep.arrivalYear[2]).toBeGreaterThan(-6000)
	})

	it("is an ordinary sea link once the shelf has drowned", () => {
		const shelf = (sourceArrival: number) =>
			MIGRATION.transit({
				sourceArrival,
				sourceOriginKm: 0,
				distanceKm: 300,
				meanSuitability: 1,
				destinationLandmassKm2: 1,
				corridorBonus: 1,
				kind: "shelf",
			})
		const sea = (sourceArrival: number) =>
			MIGRATION.transit({
				sourceArrival,
				sourceOriginKm: 0,
				distanceKm: 300,
				meanSuitability: 1,
				destinationLandmassKm2: 1,
				corridorBonus: 1,
				kind: "sea",
			})
		expect(shelf(-9400)).toBe(sea(-9400))
		expect(shelf(-20000)).toBeCloseTo(-20000 + 300 / 0.55)
	})
})

describe("contact year", () => {
	it("starts at the origin, crosses land unchanged and waits for routine voyages over the raw sea distance", () => {
		const world = MIGRATION_FIXTURE.world({
			layout: "LL####LL",
			stepDegrees: 2,
			habitability: [5, 5, 1, 1],
			horizonYear: 2025,
		})
		const result = MIGRATION.compute(world).result
		expect([result.contactYear[0], result.contactYear[1]]).toEqual([
			START,
			START,
		])
		expect(result.contactYear[2]).toBe(result.contactYear[3])
		const km = (4 * 2 * Math.PI * 6371) / 180
		expect(result.contactYear[2]).toBe(
			Math.ceil(-1000 + (1800 * Math.log(km / 850)) / Math.log(3000 / 850)),
		)
		const land = MIGRATION.compute(
			MIGRATION_FIXTURE.world({
				layout: "LLLL",
				stepDegrees: 0.5,
				habitability: [1, 1, 1, 1],
				horizonYear: 2025,
			}),
		).result
		expect([...land.contactYear]).toEqual([START, START, START, START])
	})
})

describe("state-held core", () => {
	const total = 200
	const world = MIGRATION_FIXTURE.world({
		layout: "L".repeat(total),
		stepDegrees: 0.5,
		habitability: new Array(total).fill(1),
		horizonYear: 2025,
	})
	world.provinces.landmassId = Int32Array.from({ length: total }, (_, p) =>
		p < 100 ? 0 : 1,
	)
	const held = (count: number) => {
		const mask = MIGRATION.heldCore({
			provinces: world.provinces,
			suitability: new Float64Array(total).fill(1),
			settled: new Uint8Array(total).fill(1),
			siteScore: Float32Array.from({ length: total }, (_, p) =>
				p === 150 ? 1 : 0.5,
			),
			heldWeight: Float32Array.from({ length: total }, (_, p) =>
				p < 100 ? 0.9 : 0.3,
			),
			activeCradles: [0],
			fallbackSource: 0,
			count,
			r_xyz: world.mesh.r_xyz,
			planetRadiusKm: 6371,
		})
		const on = (from: number, to: number) =>
			mask.subarray(from, to).reduce((sum, v) => sum + v, 0)
		return { mask, counts: [on(0, 100), on(100, total)] }
	}

	it("apportions the count between landmasses by held weight and grows every spaced seed", () => {
		const { mask, counts } = held(80)
		expect(counts).toEqual([60, 20])
		for (const seed of [0, 36, 72, 111, 150]) expect(mask[seed]).toBe(1)
	})

	it("fills past a landmass's capacity without budgets so the total is kept", () => {
		expect(held(180).counts).toEqual([100, 80])
	})
})
