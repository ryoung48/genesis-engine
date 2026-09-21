import { DATE } from "@/model/history/earth/date"
import type {
	AddPersonRowParams,
	AppendPeopleRowsParams,
	ApplyRowParams,
	CloseTenureParams,
	EndPersonParams,
	GrownParams,
	HealthPoint,
	MarriageView,
	MarriageViewParams,
	OpenTenureParams,
	PeopleRecord,
	PeopleRecordPersonParams,
	PeopleRecordSeatParams,
	PushHealthParams,
	TenureView,
	TenureViewParams,
} from "@/model/history/record/people/types"
import { KIN } from "@/model/history/sim/people/kin"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { DeathCause } from "@/model/history/sim/people/log/types"
import { ARRAY } from "@/model/shared/array"

const UNSET = -1
const YEAR_MS = 365 * 86_400_000
const ORIGIN_MS = DATE.earthHistoryStartYear * YEAR_MS
const DAYS_PER_YEAR = 365
const INITIAL_CAPACITY = 1024
const REASON_NONE = 0
const REASON_WIDOWED = 1
const REASON_DIVORCED = 2

function grown<T extends Int32Array | Float64Array>({
	array,
	capacity,
	fill,
}: GrownParams<T>): T {
	const next = ARRAY.growNumeric({ array, capacity })
	next.fill(fill, array.length)
	return next
}

function create(): PeopleRecord {
	const size = INITIAL_CAPACITY
	return {
		count: 0,
		capacity: size,
		present: new Uint8Array(size),
		sex: new Uint8Array(size),
		birth: new Float64Array(size),
		death: new Float64Array(size).fill(Number.POSITIVE_INFINITY),
		deathHealth: new Uint8Array(size),
		deathCause: [],
		father: new Int32Array(size).fill(UNSET),
		mother: new Int32Array(size).fill(UNSET),
		dynasty: new Int32Array(size),
		culture: new Int16Array(size),
		firstChild: new Int32Array(size).fill(UNSET),
		nextSiblingFather: new Int32Array(size).fill(UNSET),
		nextSiblingMother: new Int32Array(size).fill(UNSET),
		firstMarriage: new Int32Array(size).fill(UNSET),
		lastHealth: new Int32Array(size).fill(UNSET),
		lastTenureOfPerson: new Int32Array(size).fill(UNSET),
		healthCount: 0,
		healthCapacity: size,
		healthTime: new Float64Array(size),
		healthValue: new Uint8Array(size),
		healthPrevious: new Int32Array(size),
		marriageCount: 0,
		marriageCapacity: size,
		husband: new Int32Array(size),
		wife: new Int32Array(size),
		marriageStart: new Float64Array(size),
		marriageEnd: new Float64Array(size),
		marriageReason: new Uint8Array(size),
		nextOfHusband: new Int32Array(size),
		nextOfWife: new Int32Array(size),
		tenureCount: 0,
		tenureCapacity: size,
		tenurePerson: new Int32Array(size),
		tenureSeat: new Int32Array(size),
		tenureStart: new Float64Array(size),
		tenureEnd: new Float64Array(size),
		tenurePreviousOfSeat: new Int32Array(size),
		tenurePreviousOfPerson: new Int32Array(size),
		lastTenureOfSeat: new Map(),
		dynastyCulture: new Map(),
	}
}

function timeMsOfYear(year: number): number {
	return year * YEAR_MS - ORIGIN_MS
}

function ensurePerson({ record, person }: PeopleRecordPersonParams): void {
	if (person >= record.capacity) {
		const capacity = Math.max(person + 1, Math.ceil(record.capacity * 1.5))
		record.present = ARRAY.growNumeric({ array: record.present, capacity })
		record.sex = ARRAY.growNumeric({ array: record.sex, capacity })
		record.birth = ARRAY.growNumeric({ array: record.birth, capacity })
		record.death = grown({
			array: record.death,
			capacity,
			fill: Number.POSITIVE_INFINITY,
		})
		record.deathHealth = ARRAY.growNumeric({
			array: record.deathHealth,
			capacity,
		})
		record.dynasty = ARRAY.growNumeric({ array: record.dynasty, capacity })
		record.culture = ARRAY.growNumeric({ array: record.culture, capacity })
		for (const key of [
			"father",
			"mother",
			"firstChild",
			"nextSiblingFather",
			"nextSiblingMother",
			"firstMarriage",
			"lastHealth",
			"lastTenureOfPerson",
		] as const)
			record[key] = grown({ array: record[key], capacity, fill: UNSET })
		record.capacity = capacity
	}
	record.count = Math.max(record.count, person + 1)
}

function ensureHealth(record: PeopleRecord): void {
	if (record.healthCount < record.healthCapacity) return
	const capacity = Math.ceil(record.healthCapacity * 1.5)
	record.healthTime = ARRAY.growNumeric({ array: record.healthTime, capacity })
	record.healthValue = ARRAY.growNumeric({
		array: record.healthValue,
		capacity,
	})
	record.healthPrevious = ARRAY.growNumeric({
		array: record.healthPrevious,
		capacity,
	})
	record.healthCapacity = capacity
}

function ensureMarriage(record: PeopleRecord): void {
	if (record.marriageCount < record.marriageCapacity) return
	const capacity = Math.ceil(record.marriageCapacity * 1.5)
	record.husband = ARRAY.growNumeric({ array: record.husband, capacity })
	record.wife = ARRAY.growNumeric({ array: record.wife, capacity })
	record.marriageStart = ARRAY.growNumeric({
		array: record.marriageStart,
		capacity,
	})
	record.marriageEnd = ARRAY.growNumeric({
		array: record.marriageEnd,
		capacity,
	})
	record.marriageReason = ARRAY.growNumeric({
		array: record.marriageReason,
		capacity,
	})
	record.nextOfHusband = ARRAY.growNumeric({
		array: record.nextOfHusband,
		capacity,
	})
	record.nextOfWife = ARRAY.growNumeric({ array: record.nextOfWife, capacity })
	record.marriageCapacity = capacity
}

function ensureTenure(record: PeopleRecord): void {
	if (record.tenureCount < record.tenureCapacity) return
	const capacity = Math.ceil(record.tenureCapacity * 1.5)
	record.tenurePerson = ARRAY.growNumeric({
		array: record.tenurePerson,
		capacity,
	})
	record.tenureSeat = ARRAY.growNumeric({ array: record.tenureSeat, capacity })
	record.tenureStart = ARRAY.growNumeric({
		array: record.tenureStart,
		capacity,
	})
	record.tenureEnd = ARRAY.growNumeric({ array: record.tenureEnd, capacity })
	record.tenurePreviousOfSeat = ARRAY.growNumeric({
		array: record.tenurePreviousOfSeat,
		capacity,
	})
	record.tenurePreviousOfPerson = ARRAY.growNumeric({
		array: record.tenurePreviousOfPerson,
		capacity,
	})
	record.tenureCapacity = capacity
}

function pushHealth({
	record,
	person,
	timeMs,
	health,
}: PushHealthParams): void {
	ensurePerson({ record, person })
	ensureHealth(record)
	const point = record.healthCount++
	record.healthTime[point] = timeMs
	record.healthValue[point] = health
	record.healthPrevious[point] = record.lastHealth[person]
	record.lastHealth[person] = point
}

function addPerson({
	record,
	person,
	birthMs,
	father,
	mother,
	identity,
}: AddPersonRowParams): void {
	ensurePerson({ record, person })
	const unpacked = PEOPLE_LOG.unpackIdentity(identity)
	record.present[person] = 1
	record.sex[person] = unpacked.sex
	record.birth[person] = birthMs
	record.father[person] = father
	record.mother[person] = mother
	record.dynasty[person] = unpacked.dynasty
	record.culture[person] = unpacked.culture
	if (!record.dynastyCulture.has(unpacked.dynasty))
		record.dynastyCulture.set(unpacked.dynasty, unpacked.culture)
	KIN.link({ kin: record, child: person })
}

function openTenure({ record, person, seat, timeMs }: OpenTenureParams): void {
	const current = record.lastTenureOfSeat.get(seat)
	if (
		current !== undefined &&
		record.tenureEnd[current] === Number.POSITIVE_INFINITY
	) {
		if (record.tenurePerson[current] === person) return
		record.tenureEnd[current] = timeMs
	}
	ensurePerson({ record, person })
	ensureTenure(record)
	const tenure = record.tenureCount++
	record.tenurePerson[tenure] = person
	record.tenureSeat[tenure] = seat
	record.tenureStart[tenure] = timeMs
	record.tenureEnd[tenure] = Number.POSITIVE_INFINITY
	record.tenurePreviousOfSeat[tenure] = current ?? UNSET
	record.tenurePreviousOfPerson[tenure] = record.lastTenureOfPerson[person]
	record.lastTenureOfPerson[person] = tenure
	record.lastTenureOfSeat.set(seat, tenure)
}

function closeTenure({
	record,
	person,
	seat,
	timeMs,
}: CloseTenureParams): void {
	const current = record.lastTenureOfSeat.get(seat)
	if (
		current === undefined ||
		record.tenurePerson[current] !== person ||
		record.tenureEnd[current] !== Number.POSITIVE_INFINITY
	)
		return
	record.tenureEnd[current] = timeMs
}

function endPerson({
	record,
	person,
	timeMs,
	health,
	causeCode,
}: EndPersonParams): void {
	ensurePerson({ record, person })
	record.death[person] = timeMs
	record.deathHealth[person] = health
	record.deathCause[person] = PEOPLE_LOG.deathCauseFromCode(causeCode)
	const marriage = record.firstMarriage[person]
	if (
		marriage >= 0 &&
		record.marriageEnd[marriage] === Number.POSITIVE_INFINITY
	) {
		record.marriageEnd[marriage] = timeMs
		record.marriageReason[marriage] = REASON_WIDOWED
	}
	let tenure = record.lastTenureOfPerson[person]
	while (tenure >= 0) {
		if (record.tenureEnd[tenure] === Number.POSITIVE_INFINITY)
			record.tenureEnd[tenure] = timeMs
		tenure = record.tenurePreviousOfPerson[tenure]
	}
}

function applyRow({ record, chunk, index }: ApplyRowParams): void {
	const kind = PEOPLE_LOG.kindOf(chunk.kind[index])
	const timeMs = timeMsOfYear(chunk.time[index])
	const a = chunk.a[index]
	const b = chunk.b[index]
	const c = chunk.c[index]
	const d = chunk.d[index]
	if (kind === "birth")
		addPerson({
			record,
			person: a,
			birthMs: timeMs,
			father: b,
			mother: c,
			identity: d,
		})
	else if (kind === "arrival")
		addPerson({
			record,
			person: a,
			birthMs: timeMs - (b / DAYS_PER_YEAR) * YEAR_MS,
			father: UNSET,
			mother: UNSET,
			identity: d,
		})
	else if (kind === "death")
		endPerson({ record, person: a, timeMs, health: b, causeCode: c })
	else if (kind === "health")
		pushHealth({ record, person: a, timeMs, health: b })
	else if (kind === "seat") {
		if (c === 1) openTenure({ record, person: a, seat: b, timeMs })
		else closeTenure({ record, person: a, seat: b, timeMs })
	} else {
		ensureMarriage(record)
		const marriage = record.marriageCount++
		record.husband[marriage] = a
		record.wife[marriage] = b
		record.marriageStart[marriage] = timeMs
		record.marriageEnd[marriage] = Number.POSITIVE_INFINITY
		record.marriageReason[marriage] = REASON_NONE
		record.nextOfHusband[marriage] = record.firstMarriage[a]
		record.nextOfWife[marriage] = record.firstMarriage[b]
		record.firstMarriage[a] = marriage
		record.firstMarriage[b] = marriage
	}
}

function append({ record, chunk }: AppendPeopleRowsParams): void {
	for (let index = 0; index < chunk.count; index++)
		applyRow({ record, chunk, index })
}

function has({ record, person }: PeopleRecordPersonParams): boolean {
	return person >= 0 && person < record.count && record.present[person] === 1
}

function children({ record, person }: PeopleRecordPersonParams): number[] {
	return KIN.childrenOf({ kin: record, parent: person })
}

function marriageView({ record, marriage }: MarriageViewParams): MarriageView {
	const end = record.marriageEnd[marriage]
	const reason = record.marriageReason[marriage]
	return {
		husband: record.husband[marriage],
		wife: record.wife[marriage],
		startMs: record.marriageStart[marriage],
		endMs: Number.isFinite(end) ? end : null,
		reason:
			reason === REASON_WIDOWED
				? "widowed"
				: reason === REASON_DIVORCED
					? "divorced"
					: null,
	}
}

function marriages({
	record,
	person,
}: PeopleRecordPersonParams): MarriageView[] {
	const views: MarriageView[] = []
	if (!has({ record, person })) return views
	const next =
		record.sex[person] === 0 ? record.nextOfHusband : record.nextOfWife
	for (
		let marriage = record.firstMarriage[person];
		marriage >= 0;
		marriage = next[marriage]
	)
		views.push(marriageView({ record, marriage }))
	return views.reverse()
}

function health({ record, person }: PeopleRecordPersonParams): HealthPoint[] {
	const points: HealthPoint[] = []
	if (person < 0 || person >= record.count) return points
	for (
		let point = record.lastHealth[person];
		point >= 0;
		point = record.healthPrevious[point]
	)
		points.push({
			timeMs: record.healthTime[point],
			health: record.healthValue[point],
		})
	return points.reverse()
}

function tenureView({ record, tenure }: TenureViewParams): TenureView {
	const end = record.tenureEnd[tenure]
	return {
		person: record.tenurePerson[tenure],
		seat: record.tenureSeat[tenure],
		startMs: record.tenureStart[tenure],
		endMs: Number.isFinite(end) ? end : null,
	}
}

function tenuresOfPerson({
	record,
	person,
}: PeopleRecordPersonParams): TenureView[] {
	const views: TenureView[] = []
	if (person < 0 || person >= record.count) return views
	for (
		let tenure = record.lastTenureOfPerson[person];
		tenure >= 0;
		tenure = record.tenurePreviousOfPerson[tenure]
	)
		views.push(tenureView({ record, tenure }))
	return views.reverse()
}

function tenuresOfSeat({ record, seat }: PeopleRecordSeatParams): TenureView[] {
	const views: TenureView[] = []
	for (
		let tenure = record.lastTenureOfSeat.get(seat) ?? UNSET;
		tenure >= 0;
		tenure = record.tenurePreviousOfSeat[tenure]
	)
		views.push(tenureView({ record, tenure }))
	return views.reverse()
}

function deathCauseOf({
	record,
	person,
}: PeopleRecordPersonParams): DeathCause | null {
	return record.deathCause[person] ?? null
}

export const PEOPLE_RECORD = {
	create,
	append,
	has,
	children,
	marriages,
	health,
	tenuresOfPerson,
	tenuresOfSeat,
	deathCauseOf,
	timeMsOfYear,
	yearMs: YEAR_MS,
}
