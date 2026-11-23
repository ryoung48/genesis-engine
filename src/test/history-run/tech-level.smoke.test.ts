import { describe, expect, it } from "vitest"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import { ERAS } from "@/model/society/eras"
import type { FarmingResult } from "@/model/society/farming/types"
import { TECH_LEVEL } from "@/model/society/tech-level"
import { TECH_START } from "@/model/society/tech-level/start-year"
import { URBANIZATION } from "@/model/society/urbanization"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const PROVINCES = 1000

function ring() {
	const adjOffset = Int32Array.from({ length: PROVINCES + 1 }, (_, i) => 2 * i)
	const adjList = new Int32Array(2 * PROVINCES)
	for (let p = 0; p < PROVINCES; p++) {
		adjList[2 * p] = (p + PROVINCES - 1) % PROVINCES
		adjList[2 * p + 1] = (p + 1) % PROVINCES
	}
	const population = Float32Array.from({ length: PROVINCES }, (_, p) =>
		p % 10 === 0 ? 0 : 1000 + ((p * 7919) % 50000),
	)
	const development = Float32Array.from({ length: PROVINCES }, (_, p) =>
		Math.max(0, 1 - Math.abs((p % 100) - 50) / 20),
	)
	const sovereign = Int32Array.from({ length: PROVINCES }, (_, p) =>
		p < PROVINCES / 2 ? Math.floor(p / 50) * 50 + 1 : -1,
	)
	return {
		provinces: {
			count: PROVINCES,
			desolate: new Uint8Array(PROVINCES),
			adjOffset,
			adjList,
		},
		population,
		development,
		sovereign,
		urbanPopulation: new Float32Array(PROVINCES),
	}
}

describe("tech level", () => {
	it("derives the era preset from the requested level", () => {
		for (const era of ERAS.eraOrder) {
			const { techLevel } = ERAS.eraConfigs[era]
			expect(ERAS.eraOf({ techLevel })).toBe(era)
		}
		expect(ERAS.eraOf({ techLevel: 2.34 })).toBe("iron")
		expect(ERAS.eraOf({ techLevel: ERAS.defaultTechLevel })).toBe(
			"lateMedieval",
		)
	})

	it("converts the target back to the average it came from", () => {
		for (const average of [0, 0.19, 1, 2.35, 3.27, 4.24, 6.87, 7.78]) {
			const target = TECH_LEVEL.leaderLevel({ techLevel: average })
			expect(TECH_LEVEL.averageLevel({ target })).toBeCloseTo(average, 9)
		}
		expect(DEFAULT_WORLD_PARAMS.targetTechLevel).toBeCloseTo(3.15, 9)
		expect(
			TECH_LEVEL.averageLevel({ target: DEFAULT_WORLD_PARAMS.targetTechLevel }),
		).toBe(ERAS.defaultTechLevel)
	})

	it("reads world population at the leaders' level", () => {
		const forLeaders = (leaders: number) => {
			let low = 0
			let high = 12
			for (let step = 0; step < 60; step++) {
				const mid = (low + high) / 2
				if (TECH_LEVEL.leaderLevel({ techLevel: mid }) < leaders) low = mid
				else high = mid
			}
			return TECH_LEVEL.worldPopulation({ techLevel: (low + high) / 2 })
		}
		expect(forLeaders(3.15) / 285e6).toBeCloseTo(1, 4)
		expect(forLeaders(7.8) / 8.1e9).toBeCloseTo(1, 4)
		expect(forLeaders(2.825) / Math.sqrt(190e6 * 285e6)).toBeCloseTo(1, 4)
	})

	it("puts the maximum province level on the leader target", () => {
		const { provinces, population, development, sovereign, urbanPopulation } =
			ring()
		let misses = 0
		for (const techLevel of [0.1, 2.35, 7.3]) {
			const levels = TECH_LEVEL.assign({
				provinces,
				population,
				development,
				urbanPopulation,
				sovereign,
				farming: null,
				year: 867,
				techLevel,
			})
			const leaders = TECH_LEVEL.leaderLevel({ techLevel })
			let peak = Number.NEGATIVE_INFINITY
			for (let p = 0; p < PROVINCES; p++)
				if (Number.isFinite(levels[p])) peak = Math.max(peak, levels[p])
			if (Math.abs(peak - leaders) > 1e-3) misses++
			for (let p = 0; p < PROVINCES; p++) {
				if (population[p] === 0 && !Number.isNaN(levels[p])) misses++
				if (levels[p] < 0) misses++
			}
		}
		expect(misses).toBe(0)
	})

	it("blends a rural province between two towns and keeps towns and the maximum", () => {
		const adjOffset = Int32Array.of(0, 1, 3, 4)
		const adjList = Int32Array.of(1, 0, 2, 1)
		const provinces = {
			count: 3,
			desolate: new Uint8Array(3),
			adjOffset,
			adjList,
		}
		const run = (urbanPopulation: Float32Array) =>
			TECH_LEVEL.assign({
				provinces,
				population: Float32Array.of(5000, 5000, 5000),
				development: Float32Array.of(1, 0.55, 0.5),
				urbanPopulation,
				sovereign: new Int32Array(3).fill(-1),
				farming: null,
				year: 867,
				techLevel: 2.35,
			})
		const raw = run(Float32Array.of(5000, 5000, 5000))
		const smoothed = run(Float32Array.of(5000, 0, 5000))
		expect(smoothed[0]).toBe(raw[0])
		expect(smoothed[2]).toBe(raw[2])
		expect(smoothed[1]).toBeGreaterThan(smoothed[2])
		expect(smoothed[1]).toBeLessThan(smoothed[0])
		expect(smoothed[0]).toBeCloseTo(
			TECH_LEVEL.leaderLevel({ techLevel: 2.35 }),
			4,
		)
	})

	it("reads TL off the top, 0.45 and floor development anchors", () => {
		const techLevel = 2.35
		const leaders = TECH_LEVEL.leaderLevel({ techLevel })
		const levels = TECH_LEVEL.assign({
			provinces: {
				count: 3,
				desolate: new Uint8Array(3),
				adjOffset: new Int32Array(4),
				adjList: new Int32Array(0),
			},
			population: Float32Array.of(5000, 5000, 5000),
			development: Float32Array.of(0.9, 0.45, 0.05),
			urbanPopulation: Float32Array.of(5000, 5000, 5000),
			sovereign: new Int32Array(3).fill(-1),
			farming: null,
			year: 867,
			techLevel,
		})
		expect(levels[0]).toBeCloseTo(leaders, 5)
		expect(levels[1]).toBeCloseTo(2.3, 5)
		expect(levels[2]).toBeCloseTo(1, 5)
	})

	it("repeats the same levels for the same world", () => {
		const { provinces, population, development, sovereign, urbanPopulation } =
			ring()
		const run = () =>
			TECH_LEVEL.assign({
				provinces,
				population,
				development,
				urbanPopulation,
				sovereign,
				farming: null,
				year: 867,
				techLevel: 3,
			})
		expect(run()).toEqual(run())
	})

	it("puts developed land ahead of undeveloped land", () => {
		const { provinces, population, development, sovereign, urbanPopulation } =
			ring()
		const levels = TECH_LEVEL.assign({
			provinces,
			population,
			development,
			urbanPopulation,
			sovereign,
			farming: null,
			year: 867,
			techLevel: 2.35,
		})
		const mean = (keep: (p: number) => boolean) => {
			let mass = 0
			let people = 0
			for (let p = 0; p < PROVINCES; p++) {
				if (!Number.isFinite(levels[p]) || !keep(p)) continue
				mass += levels[p] * population[p]
				people += population[p]
			}
			return mass / people
		}
		expect(mean((p) => development[p] > 0.5)).toBeGreaterThan(
			mean((p) => development[p] === 0),
		)
	})

	it("gives tied provinces one level", () => {
		const { provinces, population } = ring()
		const levels = TECH_LEVEL.assign({
			urbanPopulation: new Float32Array(PROVINCES),
			provinces,
			population,
			development: new Float32Array(PROVINCES),
			sovereign: new Int32Array(PROVINCES).fill(-1),
			farming: null,
			year: 867,
			techLevel: 2.35,
		})
		const level = levels[1]
		let off = 0
		for (let p = 0; p < PROVINCES; p++)
			if (population[p] > 0 && Math.abs(levels[p] - level) > 1e-4) off++
		expect(off).toBe(0)
	})

	it("thins state development at stateless borders except in towns", () => {
		const line = 5
		const provinces = {
			count: line,
			desolate: new Uint8Array(line),
			adjOffset: Int32Array.of(0, 1, 3, 5, 7, 8),
			adjList: Int32Array.of(1, 0, 2, 1, 3, 2, 4, 3),
			waterAccess: new Uint8Array(line),
		}
		const sovereign = Int32Array.of(0, 0, 0, -1, -1)
		const cities = Float32Array.of(0.4, 0.3, 0.2, 0.5, 0.5)
		const rural = URBANIZATION.stateDevelopment({
			provinces,
			sovereign,
			development: cities,
			urbanPopulation: Float32Array.of(0, 0, 0, 0, 0),
		})
		const town = URBANIZATION.stateDevelopment({
			provinces,
			sovereign,
			development: cities,
			urbanPopulation: Float32Array.of(0, 0, 1000, 0, 0),
		})
		expect(rural[0]).toBeCloseTo(0.4, 6)
		expect(rural[1]).toBeCloseTo(0.3, 6)
		expect(rural[2]).toBeCloseTo(0.2 * 0.85, 6)
		expect(town[2]).toBeCloseTo(0.2, 6)
		expect(rural[3]).toBe(0)
		expect(rural[4]).toBe(0)
	})

	it("finds a later start year for a higher requested level on the planet's own timeline", () => {
		const farming = {
			settledYear: Int32Array.of(-40000, -30000, -20000),
			adoptionYear: Int32Array.of(-7000, -4000, -1000),
			herdAdoptionYear: Int32Array.of(-7000, -4000, -1000),
			forageDensity: Float32Array.of(0.5, 0.5, 0.5),
			farmCapacity: Float32Array.of(60, 60, 60),
			herdCapacity: Float32Array.of(2, 2, 2),
			farmFit: Float32Array.of(0.9, 0.9, 0.9),
			terraceFit: new Float32Array(3),
			herdFit: Float32Array.of(0, 0, 0),
			herdColonial: new Uint8Array(3),
			farmModern: new Uint8Array(3),
		}
		const timeline = {
			farming,
			areaKm2: Float32Array.of(1000, 1000, 1000),
			graph: {
				count: 3,
				desolate: new Uint8Array(3),
				adjOffset: new Int32Array(4),
				adjList: new Int32Array(0),
			},
			horizonYear: 2025,
			techLevel: 2.35,
		}
		const early = TECH_START.startYear({ ...timeline, techLevel: 1 })
		const late = TECH_START.startYear({ ...timeline, techLevel: 2.35 })
		expect(late).toBeGreaterThan(early)
		expect(
			TECH_START.farmingAgeAt({ ...timeline, year: late }),
		).toBeGreaterThanOrEqual(5580)
		expect(
			TECH_START.targetYear({
				farming,
				areaKm2: timeline.areaKm2,
				graph: timeline.graph,
				horizonYear: timeline.horizonYear,
				target: 3.15,
			}),
		).toBe(late)
		const later = TECH_START.startYear({ ...timeline, techLevel: 5 })
		expect(later - TECH_START.startYear({ ...timeline, techLevel: 3 })).toBe(
			400,
		)
	})

	it("caps town-free foragers in and out of states but never towns", () => {
		const count = 4
		const clock = {
			settledYear: new Int32Array(count).fill(-40000),
			adoptionYear: new Int32Array(count).fill(100000),
			herdAdoptionYear: new Int32Array(count).fill(100000),
			forageDensity: new Float32Array(count).fill(0.03),
			farmCapacity: new Float32Array(count).fill(60),
			herdCapacity: new Float32Array(count).fill(2),
			farmFit: new Float32Array(count),
			terraceFit: new Float32Array(count),
			herdFit: new Float32Array(count),
			herdColonial: new Uint8Array(count),
			farmModern: new Uint8Array(count),
		}
		const farming: FarmingResult = {
			startClock: clock,
			farmingYear: new Int32Array(count).fill(100000),
			herdYear: new Int32Array(count).fill(100000),
			hearthOf: new Int32Array(count).fill(-1),
			farmingFrom: new Int32Array(count).fill(-1),
			postMode: new Uint8Array(count),
			hearths: [],
			summary: {
				farmableKm2: 0,
				landEdgeSpeed: { samples: 0, p10: null, p50: null, p90: null },
				pastoralYear: 0,
				livestockKnotYears: [],
			},
			settledYear: new Int32Array(count).fill(-40000),
			adoptionYear: new Int32Array(count).fill(100000),
			herdAdoptionYear: new Int32Array(count).fill(100000),
			forageDensity: new Float32Array(count).fill(0.03),
			farmCapacity: new Float32Array(count).fill(60),
			herdCapacity: new Float32Array(count).fill(2),
			farmFit: new Float32Array(count),
			terraceFit: new Float32Array(count),
			ground: {
				plough: new Float32Array(count).fill(1),
				terrace: new Float32Array(count).fill(1),
			},
			herdFit: new Float32Array(count),
			herdColonial: new Uint8Array(count),
			farmModern: new Uint8Array(count),
		}
		const levels = TECH_LEVEL.assign({
			provinces: {
				count,
				desolate: new Uint8Array(count),
				adjOffset: new Int32Array(count + 1),
				adjList: new Int32Array(0),
			},
			population: Float32Array.of(1000, 1000, 1000, 1000),
			development: Float32Array.of(1, 0.5, 1, 0.5),
			urbanPopulation: Float32Array.of(1000, 0, 0, 0),
			sovereign: Int32Array.of(0, 0, -1, -1),
			farming,
			year: 2025,
			techLevel: 2,
		})
		expect(levels[0]).toBeGreaterThan(0.2 + 0.1)
		expect(levels[1]).toBeLessThanOrEqual(0.2 + 1e-6)
		expect(levels[2]).toBeLessThanOrEqual(0.2 + 1e-6)
		expect(levels[3]).toBeLessThanOrEqual(0.2 + 1e-6)
	})

	it("names each level from the detailed descriptor scale", () => {
		const cases: [number, string][] = [
			[0, "Paleolithic"],
			[0.9, "Neolithic"],
			[1, "Copper Age"],
			[2, "Iron Age"],
			[2.35, "Classical Age"],
			[3.7, "Late Middle Ages"],
			[4, "Renaissance"],
			[5, "Industrial Revolution"],
			[12, "Space Age"],
		]
		for (const [techLevel, name] of cases)
			expect(TECH_LEVEL.describe({ techLevel })).toBe(name)
	})

	it("reads the leader target from Earth", () => {
		expect(TECH_LEVEL.leaderLevel({ techLevel: 2.35 })).toBeCloseTo(3.15, 10)
	})

	it("reads energy, urban share and state-held anchors", () => {
		expect(TECH_LEVEL.watts({ techLevel: 2 })).toBeCloseTo(1000, 6)
		expect(TECH_LEVEL.watts({ techLevel: 8 })).toBeCloseTo(10000, 6)
		expect(TECH_LEVEL.kardashev({ watts: 1e13 })).toBeCloseTo(0.7, 10)
		expect(TECH_LEVEL.urbanShare({ techLevel: 3 })).toBeCloseTo(0.08, 10)
		expect(TECH_LEVEL.urbanShare({ techLevel: 12 })).toBeCloseTo(0.8, 10)
		expect(TECH_LEVEL.largestCity({ techLevel: 8 })).toBeCloseTo(37e6, -1)
		expect(TECH_LEVEL.stateHeld({ techLevel: 1.8 })).toBeCloseTo(0.3285, 10)
		expect(TECH_LEVEL.stateHeld({ techLevel: 9 })).toBe(1)
	})

	it("sums every realm-size row to one", () => {
		for (const techLevel of [0, 0.19, 0.56, 1.8, 2.35, 3, 5.1, 7.8, 12]) {
			const plan = TECH_LEVEL.sizePlan({ techLevel })
			expect(
				plan.percentages.reduce((sum, share) => sum + share, 0),
			).toBeCloseTo(1, 10)
			expect(plan.buckets).toHaveLength(plan.percentages.length)
		}
		expect(TECH_LEVEL.sizePlan({ techLevel: 3.5 }).buckets[0]).toEqual([
			101, 794,
		])
	})

	it("dates the start year from the farming state before the crop exchange and the modern ramps", () => {
		const generated = GENERATE_WORLD.generateGenesisWorld({
			params: {
				...DEFAULT_WORLD_PARAMS,
				seed: 14963991,
				targetTechLevel: 7.8,
				numPoints: 20000,
				tideLock: null,
			},
		})
		const farming = generated.farming
		const provinces = generated.provinces
		if (!farming || !provinces) throw new Error("world has no farming")
		const techLevel = TECH_LEVEL.averageLevel({ target: 7.8 })
		const fromClock = TECH_START.startYear({
			farming: farming.startClock,
			areaKm2: provinces.areaKm2 ?? [],
			graph: provinces,
			horizonYear: 10000,
			techLevel,
		})
		expect(generated.population?.startYear).toBe(fromClock)
		expect(farming.startClock.farmModern.some((flag) => flag === 1)).toBe(false)
		expect(farming.farmModern.some((flag) => flag === 1)).toBe(true)
		expect(
			farming.adoptionYear.some(
				(year, p) => year < farming.startClock.adoptionYear[p],
			),
		).toBe(true)
	}, 120000)
})
