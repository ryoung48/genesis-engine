import { createHash } from "node:crypto"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import type { PeopleRecord } from "@/model/history/record/people/types"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type {
	AttachedPeopleRecord,
	IngestParams,
	PeopleRecordReport,
	PeopleRecordTracker,
} from "@/test/history-run/report/people-record/types"

function yearsToMs(years: number): number {
	return years * STATE.yearMs
}

// Times every journal flush from here on; the initial flush has already run.
function attach(): AttachedPeopleRecord {
	const tracker: PeopleRecordTracker = {
		record: PEOPLE_RECORD.create(),
		flushMs: 0,
		ingestionMs: 0,
		rows: {},
		transferredBytes: 0,
	}
	const flush = JOURNAL.flush
	JOURNAL.flush = (params) => {
		const started = performance.now()
		flush(params)
		tracker.flushMs += performance.now() - started
	}
	return {
		tracker,
		detach: () => {
			JOURNAL.flush = flush
		},
	}
}

function ingest({ tracker, transactions }: IngestParams): void {
	for (const { people: packet, timeMs } of transactions) {
		if (!packet) continue
		const started = performance.now()
		PEOPLE_RECORD.append({
			record: tracker.record,
			packet,
			timeMs,
			recordTime: yearsToMs,
		})
		tracker.ingestionMs += performance.now() - started
		for (const column of Object.values(packet))
			if (ArrayBuffer.isView(column))
				tracker.transferredBytes += column.byteLength
		for (let index = 0; index < packet.count; index++) {
			const { kind } = PEOPLE_LOG.read({ rows: packet, index })
			tracker.rows[kind] = (tracker.rows[kind] ?? 0) + 1
		}
	}
}

// People in id order with their pregnancies and stress rows, then marriages,
// betrothals and tenures in the order the record holds them.
function sha256(people: PeopleRecord): string {
	const hash = createHash("sha256")
	const add = (row: unknown[]) => {
		hash.update(JSON.stringify(row))
		hash.update("\n")
	}
	for (let id = 0; id < PEOPLE_RECORD.count(people); id++) {
		const person = PEOPLE_RECORD.person({ people, id })
		if (!person) throw new Error(`Record is missing person ${id}`)
		add([
			person.id,
			person.sex,
			person.birthTimeMs,
			person.deathTimeMs,
			person.father,
			person.mother,
			person.dynasty,
			person.culture,
			person.nameSeed,
			person.home,
			person.initialResidence,
			(people.residencesOf.get(id) ?? []).map((row) => [
				row.timeMs,
				row.province,
				row.sequence,
			]),
			person.bases,
			person.personality,
			person.grades,
			person.congenital,
			person.carried,
			(people.childrenOf.get(id) ?? []).slice(),
			(people.pregnanciesOf.get(id) ?? []).map((row) => [
				row.father,
				row.timeMs,
				row.outcome,
			]),
			(people.stressOf.get(id) ?? []).map((row) => [row.timeMs, row.level]),
		])
	}
	for (const row of people.marriages)
		add([row.husband, row.wife, row.startTimeMs])
	for (const row of people.betrothals)
		add([row.a, row.b, row.startTimeMs, row.endTimeMs, row.cause])
	for (const row of people.tenures)
		add([
			row.person,
			row.seat,
			row.kind,
			row.ward,
			row.startTimeMs,
			row.endTimeMs,
			row.startReason,
			row.endReason,
		])
	return hash.digest("hex")
}

function summarize(tracker: PeopleRecordTracker): PeopleRecordReport {
	return {
		people: PEOPLE_RECORD.count(tracker.record),
		sha256: sha256(tracker.record),
		flushMs: tracker.flushMs,
		ingestionMs: tracker.ingestionMs,
		rows: tracker.rows,
		transferredBytes: tracker.transferredBytes,
	}
}

export const PEOPLE_RECORD_REPORT = { attach, ingest, summarize }
