import type {
	AppendPeopleParams,
	BetrothalPairParams,
	PeopleRecord,
	PushIndexParams,
} from "@/model/history/record/people/types"

function create(): PeopleRecord {
	return {
		persons: new Map(),
		childrenOf: new Map(),
		marriages: [],
		marriagesOf: new Map(),
		tenures: [],
		tenuresOf: new Map(),
		tenuresOfSeat: new Map(),
		regentsOfSeat: new Map(),
		regentsOfWard: new Map(),
		dynastyHome: new Map(),
		pregnanciesOf: new Map(),
		betrothals: [],
		betrothalsOf: new Map(),
	}
}

function pushIndex<T>({ index, key, value }: PushIndexParams<T>): void {
	const list = index.get(key)
	if (list) list.push(value)
	else index.set(key, [value])
}

function openBetrothal({ record, a, b }: BetrothalPairParams): number {
	for (const index of record.betrothalsOf.get(a) ?? []) {
		const betrothal = record.betrothals[index]
		if (betrothal.cause === null && (betrothal.a === b || betrothal.b === b))
			return index
	}
	return -1
}

function append({
	record,
	rows,
	timeMs,
	recordTime,
}: AppendPeopleParams): void {
	for (const row of rows.persons) {
		if (row.dynasty >= 0 && !record.dynastyHome.has(row.dynasty))
			record.dynastyHome.set(row.dynasty, row.home)
		record.persons.set(row.id, {
			...row,
			birthTimeMs: recordTime(row.birthTimeMs),
			deathTimeMs: recordTime(row.deathTimeMs),
		})
		for (const parent of [row.father, row.mother])
			if (parent >= 0)
				pushIndex({ index: record.childrenOf, key: parent, value: row.id })
	}
	for (const { id, deathTimeMs } of rows.deaths) {
		const person = record.persons.get(id)
		if (person) person.deathTimeMs = recordTime(deathTimeMs)
	}
	for (const { mother, father, timeMs, outcome } of rows.pregnancies)
		pushIndex({
			index: record.pregnanciesOf,
			key: mother,
			value: { father, timeMs: recordTime(timeMs), outcome },
		})
	for (const { a, b, timeMs: startMs } of rows.betrothals) {
		const index = record.betrothals.length
		record.betrothals.push({
			a,
			b,
			startTimeMs: recordTime(startMs),
			endTimeMs: Infinity,
			cause: null,
		})
		pushIndex({ index: record.betrothalsOf, key: a, value: index })
		pushIndex({ index: record.betrothalsOf, key: b, value: index })
	}
	for (const { a, b, timeMs: endMs, cause } of rows.betrothalEnds) {
		const index = openBetrothal({ record, a, b })
		if (index < 0) continue
		record.betrothals[index].endTimeMs = recordTime(endMs)
		record.betrothals[index].cause = cause
	}
	for (const row of rows.marriages) {
		const betrothal = openBetrothal({ record, a: row.husband, b: row.wife })
		if (betrothal >= 0) {
			record.betrothals[betrothal].endTimeMs = recordTime(row.startTimeMs)
			record.betrothals[betrothal].cause = "married"
		}
		const index = record.marriages.length
		record.marriages.push({ ...row, startTimeMs: recordTime(row.startTimeMs) })
		pushIndex({ index: record.marriagesOf, key: row.husband, value: index })
		pushIndex({ index: record.marriagesOf, key: row.wife, value: index })
	}
	for (const { seat, person, kind, ward, reason } of rows.seats) {
		const ofSeat =
			kind === "regent" ? record.regentsOfSeat : record.tenuresOfSeat
		const open = ofSeat.get(seat)?.at(-1)
		if (open !== undefined && record.tenures[open].endTimeMs === Infinity) {
			if (record.tenures[open].person === person) continue
			record.tenures[open].endTimeMs = timeMs
			record.tenures[open].endReason = reason
		}
		if (person < 0) continue
		const index = record.tenures.length
		record.tenures.push({
			person,
			seat,
			kind,
			ward,
			startTimeMs: timeMs,
			endTimeMs: Infinity,
			endReason: null,
		})
		pushIndex({ index: record.tenuresOf, key: person, value: index })
		pushIndex({ index: ofSeat, key: seat, value: index })
		if (kind === "regent")
			pushIndex({ index: record.regentsOfWard, key: ward, value: index })
	}
}

export const PEOPLE_RECORD = { create, append }
