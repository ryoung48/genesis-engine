import { expect } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { KIN } from "@/model/history/sim/people/kin"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type {
	DynastyCultureParams,
	NearParams,
	RowCounts,
	RowCoverageParams,
	VerifyPeopleParams,
} from "@/test/history-run/people-record/types"

const YEAR_MS = 365 * 86_400_000
const TOLERANCE_MS = 0.002 * YEAR_MS
const SETTLED_YEARS = 0.01

function near({ actual, expected }: NearParams): boolean {
	return Math.abs(actual - expected) <= TOLERANCE_MS
}

function rowCoverage({ engine, transactions }: RowCoverageParams): RowCounts {
	const persons = engine.people?.persons
	if (!persons) throw new Error("History has no people")
	const rows = new Uint8Array(persons.count)
	const counts: RowCounts = { arrivals: 0, births: 0 }
	for (const transaction of transactions)
		for (const chunk of transaction.people)
			for (let i = 0; i < chunk.count; i++) {
				const kind = PEOPLE_LOG.kindOf(chunk.kind[i])
				if (kind !== "birth" && kind !== "arrival") continue
				rows[chunk.a[i]]++
				if (kind === "birth") counts.births++
				else counts.arrivals++
			}
	for (let person = 0; person < persons.count; person++)
		expect(rows[person], `person ${person} birth or arrival rows`).toBe(1)
	return counts
}

function verifyPersons({ engine, record, year }: VerifyPeopleParams): void {
	const people = engine.people
	if (!people) throw new Error("History has no people")
	const persons = people.persons
	expect(record.count).toBe(persons.count)
	for (let person = 0; person < persons.count; person++) {
		const context = `person ${person}`
		expect(PEOPLE_RECORD.has({ record, person }), context).toBe(true)
		expect(record.sex[person], context).toBe(persons.sex[person])
		expect(record.father[person], context).toBe(persons.father[person])
		expect(record.mother[person], context).toBe(persons.mother[person])
		expect(record.dynasty[person], context).toBe(persons.dynasty[person])
		expect(record.culture[person], context).toBe(persons.culture[person])
		expect(
			near({
				actual: record.birth[person],
				expected: PEOPLE_RECORD.timeMsOfYear(persons.birth[person]),
			}),
			`${context} birth`,
		).toBe(true)
		const tableDeath = persons.death[person]
		if (tableDeath < year - SETTLED_YEARS) {
			expect(
				near({
					actual: record.death[person],
					expected: PEOPLE_RECORD.timeMsOfYear(tableDeath),
				}),
				`${context} death`,
			).toBe(true)
			expect(record.deathHealth[person], `${context} death health`).toBe(
				persons.health[person],
			)
			const cause =
				persons.deathCause[person] === PEOPLE_LOG.CHILDBIRTH_MARK
					? "childbirth"
					: tableDeath - persons.birth[person] < 16
						? "childhood"
						: "natural"
			expect(PEOPLE_RECORD.deathCauseOf({ record, person }), context).toBe(
				cause,
			)
		} else if (tableDeath > year + SETTLED_YEARS) {
			expect(record.death[person], `${context} alive`).toBe(
				Number.POSITIVE_INFINITY,
			)
		}
		const expectedChildren = KIN.childrenOf({ kin: persons, parent: person })
			.map((child) => [Math.fround(persons.birth[child]), child])
			.sort((a, b) => a[0] - b[0] || a[1] - b[1])
			.map(([, child]) => child)
		const recordChildren = PEOPLE_RECORD.children({ record, person })
			.map((child) => [Math.fround(persons.birth[child]), child])
			.sort((a, b) => a[0] - b[0] || a[1] - b[1])
			.map(([, child]) => child)
		expect(recordChildren, `${context} children`).toEqual(expectedChildren)
	}
}

function verifyBands({ engine, record, year }: VerifyPeopleParams): void {
	const persons = engine.people?.persons
	if (!persons) throw new Error("History has no people")
	for (let person = 0; person < persons.count; person++) {
		if (persons.death[person] <= year + SETTLED_YEARS) continue
		const points = PEOPLE_RECORD.health({ record, person })
		expect(points.length, `person ${person} health rows`).toBeGreaterThan(0)
		expect(
			LIFESPAN.healthBand(points[points.length - 1].health),
			`person ${person} band in ${year}`,
		).toBe(LIFESPAN.healthBand(persons.health[person]))
	}
}

function verifyMarriages({ engine, record, year }: VerifyPeopleParams): void {
	const marriages = engine.people?.marriages
	if (!marriages) throw new Error("History has no people")
	expect(record.marriageCount).toBe(marriages.count)
	for (let marriage = 0; marriage < marriages.count; marriage++) {
		const husband = marriages.husband[marriage]
		const start = PEOPLE_RECORD.timeMsOfYear(marriages.start[marriage])
		const found = PEOPLE_RECORD.marriages({ record, person: husband }).find(
			(view) =>
				view.wife === marriages.wife[marriage] &&
				near({ actual: view.startMs, expected: start }),
		)
		const context = `marriage ${marriage}`
		expect(found, context).toBeDefined()
		const end = marriages.end[marriage]
		if (end < year - SETTLED_YEARS) {
			expect(found?.reason, context).toBe("widowed")
			expect(
				near({
					actual: found?.endMs ?? Number.NaN,
					expected: PEOPLE_RECORD.timeMsOfYear(end),
				}),
				`${context} end`,
			).toBe(true)
		} else if (end === Number.POSITIVE_INFINITY) {
			expect(found?.endMs ?? null, `${context} open`).toBeNull()
		}
	}
}

function verifyTenures({ engine, record }: VerifyPeopleParams): void {
	const people = engine.people
	if (!people) throw new Error("History has no people")
	for (let seat = 0; seat < people.holderOfSeat.length; seat++) {
		const tenures = PEOPLE_RECORD.tenuresOfSeat({ record, seat })
		const last = tenures[tenures.length - 1]
		const holder = people.holderOfSeat[seat]
		const context = `seat ${seat}`
		if (holder >= 0) {
			expect(last?.person, context).toBe(holder)
			expect(last?.endMs ?? null, `${context} open`).toBeNull()
		} else if (last) expect(last.endMs, `${context} vacant`).not.toBeNull()
		for (let i = 1; i < tenures.length; i++)
			expect(
				tenures[i - 1].endMs ?? Number.POSITIVE_INFINITY,
				`${context} overlap`,
			).toBeLessThanOrEqual(tenures[i].startMs)
	}
	for (let tenure = 0; tenure < record.tenureCount; tenure++) {
		const person = record.tenurePerson[tenure]
		const end = record.tenureEnd[tenure]
		expect(
			end,
			`tenure ${tenure} of dead person ${person}`,
		).toBeLessThanOrEqual(record.death[person] + TOLERANCE_MS)
	}
}

function verifyDynastyCultures({
	engine,
	record,
	transactions,
}: DynastyCultureParams): void {
	const persons = engine.people?.persons
	if (!persons) throw new Error("History has no people")
	const first = new Map<number, number>()
	for (const transaction of transactions)
		for (const chunk of transaction.people)
			for (let i = 0; i < chunk.count; i++) {
				const kind = PEOPLE_LOG.kindOf(chunk.kind[i])
				if (kind !== "birth" && kind !== "arrival") continue
				const dynasty = persons.dynasty[chunk.a[i]]
				if (!first.has(dynasty)) first.set(dynasty, persons.culture[chunk.a[i]])
			}
	expect(record.dynastyCulture.size).toBe(first.size)
	for (const [dynasty, culture] of first)
		expect(record.dynastyCulture.get(dynasty), `dynasty ${dynasty}`).toBe(
			culture,
		)
}

export const PEOPLE_RECORD_VERIFY = {
	rowCoverage,
	verifyPersons,
	verifyBands,
	verifyMarriages,
	verifyTenures,
	verifyDynastyCultures,
}
