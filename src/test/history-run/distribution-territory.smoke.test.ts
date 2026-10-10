import { expect, it } from "vitest"
import { DISTRIBUTION_ENGINE } from "@/model/history/distribution/engine"
import { DISTRIBUTION_SECESSION as SECESSION } from "@/model/history/distribution/secession"
import { DISTRIBUTION_STATEHOOD as S } from "@/model/history/distribution/statehood"
import { DISTRIBUTION_TARGETS as TARGETS } from "@/model/history/distribution/targets"
import { DISTRIBUTION_TERRITORY as T } from "@/model/history/distribution/territory"
import { DISTRIBUTION_FIXTURE } from "@/test/history-run/fixtures/distribution"

it("carves a connected successor around a far seed and keeps the capital", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: Array.from({ length: 10 }, (_, i) =>
			[i - 1, i + 1].filter((n) => n >= 0 && n < 10),
		),
		desolate: [],
		seed: 42,
	})
	const territory = DISTRIBUTION_FIXTURE.territory({
		world,
		groups: [Array.from({ length: 10 }, (_, i) => i)],
	})
	const country = territory.countries.get(0)
	if (!country) throw new Error("Missing country")
	const capital = country.capital
	const provinces = SECESSION.carve({
		territory,
		country,
		seed: 9,
		size: 5,
		limit: 9,
	})
	expect(provinces).toHaveLength(5)
	expect(provinces).not.toContain(capital)
	T.split({ territory, country, provinces })
	expect(country.capital).toBe(capital)
	expect(T.validate({ territory })).toEqual({
		ownership: 0,
		connectivity: 0,
		capitals: 0,
	})
})

it("takes the pocket cut off by a captured articulation and keeps the defender connected", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1, 3], [0, 2, 4], [1, 3], [0, 2, 5], [1], [3]],
		desolate: [],
		seed: 42,
	})
	const territory = DISTRIBUTION_FIXTURE.territory({
		world,
		groups: [[0, 1, 2, 3], [4], [5]],
	})
	expect(
		T.transfer({
			territory,
			attacker: 1,
			defender: 0,
			province: 1,
			ceiling: 10,
		}),
	).toBe(true)
	expect(
		T.transfer({
			territory,
			attacker: 2,
			defender: 0,
			province: 3,
			ceiling: 10,
		}),
	).toBe(true)
	expect(territory.owner[2]).toBe(2)
	expect(territory.countries.get(0)?.members).toEqual(new Set([0]))
	expect(T.validate({ territory })).toEqual({
		ownership: 0,
		connectivity: 0,
		capitals: 0,
	})
})

it("enforces an oversized star ceiling while retaining the core", () => {
	const count = 501,
		world = DISTRIBUTION_FIXTURE.world({
			neighbors: Array.from({ length: count }, (_, i) =>
				i === 0 ? Array.from({ length: count - 1 }, (_, j) => j + 1) : [0],
			),
			desolate: [],
			seed: 42,
		})
	const engine = DISTRIBUTION_FIXTURE.engine({
		world,
		groups: [Array.from({ length: count }, (_, i) => i)],
		year: 2,
	})
	DISTRIBUTION_ENGINE.advance({ engine })
	expect(
		Math.max(
			...[...engine.territory.countries.values()].map((c) => c.members.size),
		),
	).toBeLessThanOrEqual(500)
	expect(engine.territory.countries.get(0)?.capital).toBe(0)
	expect(T.validate({ territory: engine.territory })).toEqual({
		ownership: 0,
		connectivity: 0,
		capitals: 0,
	})
})
it("partitions isolated residuals and keeps capitals through carved splits", () => {
	const world = DISTRIBUTION_FIXTURE.world({
		neighbors: [[1], [0, 2], [1, 3], [2], []],
		desolate: [],
		seed: 42,
	})
	const territory = DISTRIBUTION_FIXTURE.territory({
		world,
		groups: [[0, 1, 2, 3], [4]],
	})
	const c = [...territory.countries.values()].find((c) => c.members.size > 1)
	if (c) {
		const capital = c.capital
		T.split({
			territory,
			country: c,
			provinces: SECESSION.carve({
				territory,
				country: c,
				seed: 3,
				size: 2,
				limit: 3,
			}),
		})
		expect(c.capital).toBe(capital)
	}
	expect(T.validate({ territory })).toEqual({
		ownership: 0,
		connectivity: 0,
		capitals: 0,
	})
})

it("shares the 200-year eligibility boundary between normal and fallback founding", () => {
	for (const mode of ["found", "absorb"] as const) {
		const w = DISTRIBUTION_FIXTURE.world({
			neighbors: [[]],
			desolate: [],
			seed: 42,
		})
		const engine = DISTRIBUTION_FIXTURE.engine({
			world: w,
			groups: [],
			year: 2025,
		})
		engine.migration.arrivalYear[0] = 1826
		engine.target = TARGETS.project({ capacities: [1], year: 2025 })
		S[mode]({ engine })
		expect(engine.territory.countries.size).toBe(0)
		engine.migration.arrivalYear[0] = 1825
		S[mode]({ engine })
		expect(engine.territory.countries.size).toBe(1)
	}
})
it("prioritizes an active cradle and never absorbs uninhabited land", () => {
	const w = DISTRIBUTION_FIXTURE.world({
		neighbors: [[], []],
		desolate: [],
		seed: 42,
	})
	const engine = DISTRIBUTION_FIXTURE.engine({
		world: w,
		groups: [],
		year: 2025,
	})
	engine.migration.arrivalYear.fill(-79999)
	engine.target = TARGETS.project({ capacities: [1, 1], year: 2025 })
	engine.siteScore = Float32Array.of(100, 1)
	engine.cradles.schedule = [
		{
			province: 1,
			selectionYear: -3300,
			arrivalYear: -79999,
			residenceYears: 76699,
			componentId: 1,
			nearestDistanceKm: Infinity,
		},
	]
	engine.cradles.cursor = 1
	S.found({ engine })
	expect(engine.territory.countries.get(0)?.capital).toBe(1)
	engine.territory.owner[0] = -1
	S.absorb({ engine })
	expect(engine.territory.owner[0]).toBe(-1)
})
it("keeps all countries absent through the first-state boundary", () => {
	const engine = DISTRIBUTION_ENGINE.create({
		world: DISTRIBUTION_FIXTURE.world({
			neighbors: [[1], [0]],
			desolate: [],
			seed: 42,
		}),
	})
	DISTRIBUTION_ENGINE.advanceUntil({ engine, year: -3300 })
	expect(engine.territory.countries.size).toBe(0)
	expect(engine.preStatePoliticalSteps).toBe(0)
})
