import { expect, it } from "vitest"
import { DISTRIBUTION_CRADLES as C } from "@/model/history/distribution/cradles"
import { DISTRIBUTION_ENGINE as E } from "@/model/history/distribution/engine"
import { MIGRATION } from "@/model/society/migration"
import { DISTRIBUTION_FIXTURE as F } from "@/test/history-run/fixtures/distribution"
import { DISTRIBUTION_REPORT as R } from "@/test/history-run/report/distribution"

it("enforces millennial residence and saturates maturity", () => {
	expect(
		MIGRATION.matureScore({ siteScore: 3, arrivalYear: 1, year: 2000 }),
	).toBe(0)
	expect(
		MIGRATION.matureScore({ siteScore: 3, arrivalYear: 0, year: 2000 }),
	).toBe(3)
	expect(
		MIGRATION.matureScore({ siteScore: 3, arrivalYear: 0, year: 4000 }),
	).toBe(6)
	expect(
		MIGRATION.matureScore({ siteScore: 3, arrivalYear: 0, year: 8000 }),
	).toBe(6)
})
it("keeps scheduled cradles inactive until their review dates and reconstructs earlier choices", () => {
	const w = F.world({ neighbors: [[], []], desolate: [], seed: 42 })
	if (w.historyMigration.pipeline !== "distribution") throw new Error("Fixture")
	const migration = w.historyMigration.data
	migration.arrivalYear = Int32Array.of(-79999, -1600)
	const positions = Float32Array.of(1, 0, 0, 0, 1, 0)
	const params = {
		provinces: w.provinces!,
		migration,
		siteScore: Float32Array.of(1, 2),
		r_xyz: positions,
		planetRadiusKm: 6371,
	}
	const cradles = C.create(params)
	expect(cradles.schedule.map((c) => [c.province, c.selectionYear])).toEqual([
		[0, -3300],
		[1, 400],
	])
	expect(cradles.cursor).toBe(0)
	expect([...cradles.nearestId]).toEqual([-1, -1])
	C.activate({ ...params, cradles, year: 300 })
	expect(cradles.cursor).toBe(1)
	const before = cradles.nearestDistanceKm.slice()
	C.activate({ ...params, cradles, year: 400 })
	expect(cradles.cursor).toBe(2)
	expect(cradles.nearestDistanceKm[1]).toBe(0)
	const earlier = C.atYear({ ...params, cradles, year: 300 })
	expect(earlier.nearestDistanceKm).toEqual(before)
	expect(migration.arrivalYear).toEqual(Int32Array.of(-79999, -1600))
})

it("queries prehistoric ownership and cradle metadata after later playback without mutating the engine", () => {
	const engine = E.create({
		world: F.world({ neighbors: [[1], [0]], desolate: [], seed: 42 }),
	})
	E.advanceUntil({ engine, year: 400 })
	engine.cradles.schedule.push({
		province: 1,
		selectionYear: 400,
		arrivalYear: -10000,
		residenceYears: 10400,
		componentId: 0,
		nearestDistanceKm: 3000,
	})
	const row = R.snapshotAt({ engine, year: -79999 })
	expect(row.year).toBe(-79999)
	expect(row.count).toBe(0)
	expect(row.cradles).toHaveLength(0)
	expect(row.invariants.lifecycle).toBe(0)
	expect(engine.year).toBe(400)
})
