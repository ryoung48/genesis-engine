import { expect, it } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { BACKFILL_FIXTURE } from "@/test/history-run/fixtures/backfill"
import { PEOPLE_FAMILIES_REPORT } from "@/test/history-run/report/people-families"

it("reconciles startup population, maternal roots, tenure evidence and measured byte/ms units", () => {
	const capture = PEOPLE_FAMILIES_REPORT.attach()
	let fixture: ReturnType<typeof BACKFILL_FIXTURE.create>
	try {
		fixture = BACKFILL_FIXTURE.create({
			seed: 1,
			genderSystem: 2,
			age: 40,
			sovereign: true,
		})
	} finally {
		capture.detach()
	}
	const { people, house } = fixture
	people.rulerOf[0] = house.holder.person
	const record = PEOPLE_RECORD.create()
	PEOPLE_RECORD.append({
		record,
		packet: PEOPLE_LOG.seal({ people, sovereign: () => true }),
		timeMs: 100 * STATE.yearMs,
		recordTime: (time) => time * STATE.yearMs,
	})
	const engine = {
		people,
		time: 100 * STATE.yearMs,
		P: 8,
		parentCurrent: new Int32Array(8).fill(-1),
		sovereignCurrent: new Int32Array(8).fill(0),
		hierarchyDirty: false,
		culture: new Int32Array(8),
		cultureGenderSystems: new Uint8Array([2]),
	} as HistoryState
	const report = PEOPLE_FAMILIES_REPORT.of({
		engine,
		peopleRecord: record,
		capture,
	})
	expect(report.people).toBe(people.persons.sex.length)
	expect(report.living + report.dead).toBe(report.people)
	expect(report.rejectedCandidatesLiving + report.rejectedCandidatesDead).toBe(
		people.startingFamilies.rejectedCandidates.length,
	)
	expect(report.holders).toEqual({ sovereign: 1, district: 0, patrician: 0 })
	expect(report.dynastyRoots).toBe(people.nextDynasty)
	expect(report.singletonDynasties).toBeGreaterThanOrEqual(1)
	for (const bytes of Object.values(report.retainedBytes))
		expect(bytes).toBeGreaterThanOrEqual(0)
	expect(report.peakInitializationHeapBytes).toBeGreaterThan(0)
	expect(report.memoryMeasurementMs).toBeGreaterThanOrEqual(0)
})
