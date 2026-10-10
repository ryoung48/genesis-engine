import { expect, it } from "vitest"
import { DISTRIBUTION_ENGINE } from "@/model/history/distribution/engine"
import { DISTRIBUTION_SECESSION as SECESSION } from "@/model/history/distribution/secession"
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
