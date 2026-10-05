import { PEOPLE_RECORD } from "@/model/history/record/people"
import { AFFILIATION } from "@/model/history/record/people/query/affiliation"
import type {
	AttributeView,
	BetrothalView,
	ConditionView,
	CoupleAtParams,
	MemoryView,
	OpinionContextParams,
	OpinionQueryParams,
	PersonAtParams,
	PersonEvent,
	PersonEventKind,
	PersonView,
	PopularityQueryParams,
	RealmAtParams,
	SeatAtParams,
	SpouseView,
	TenureView,
	TraitsView,
} from "@/model/history/record/people/query/types"
import type { RecordMemory } from "@/model/history/record/people/types"
import { yearMs } from "@/model/history/sim/engine/state/time"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import type { HealthBand } from "@/model/history/sim/people/health/types"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { OPINION } from "@/model/history/sim/people/opinion"
import { OPINION_MEMORY } from "@/model/history/sim/people/opinion/memory"
import type { OpinionMemoryReason } from "@/model/history/sim/people/opinion/memory/types"
import type {
	OpinionBreakdown,
	OpinionContext,
	OpinionPerson,
	Popularity,
} from "@/model/history/sim/people/opinion/types"
import { TRAITS } from "@/model/history/sim/people/traits"
import type { DeathCause } from "@/model/history/sim/people/types"
import { EFFECTIVE_TIME } from "@/model/shared/time/effective"

const DEATH_EVENTS: Record<DeathCause, PersonEventKind> = {
	natural: "died",
	heart: "died of heart failure",
	battle: "killed in battle",
	childbirth: "died in childbirth",
}

function until(time: number, timeMs: number): number | null {
	return time <= timeMs ? time : null
}

function view({ people, id, timeMs }: PersonAtParams): PersonView | null {
	const person = PEOPLE_RECORD.person({ people, id })
	if (
		!person ||
		person.birthTimeMs > timeMs ||
		people.persons.createdTimeMs[id] > timeMs
	)
		return null
	const bornBy = (other: number) =>
		PEOPLE_RECORD.birthTimeMs({ people, id: other }) <= timeMs
	const spouses: SpouseView[] = []
	for (const index of people.marriagesOf.get(id) ?? []) {
		const marriage = people.marriages[index]
		if (marriage.startTimeMs > timeMs) continue
		const partner = marriage.husband === id ? marriage.wife : marriage.husband
		const partnerDeath = PEOPLE_RECORD.deathTimeMs({ people, id: partner })
		spouses.push({
			person: partner,
			startTimeMs: marriage.startTimeMs,
			endTimeMs: until(Math.min(person.deathTimeMs, partnerDeath), timeMs),
		})
	}
	const betrothals: BetrothalView[] = []
	for (const index of people.betrothalsOf.get(id) ?? []) {
		const betrothal = people.betrothals[index]
		if (betrothal.startTimeMs > timeMs) continue
		const ended = betrothal.endTimeMs <= timeMs
		betrothals.push({
			person: betrothal.a === id ? betrothal.b : betrothal.a,
			startTimeMs: betrothal.startTimeMs,
			endTimeMs: ended ? betrothal.endTimeMs : null,
			cause: ended ? betrothal.cause : null,
		})
	}
	const tenureViews = (indices: number[]) =>
		indices.flatMap((index): TenureView[] => {
			const tenure = people.tenures[index]
			if (
				tenure.startTimeMs === null
					? tenure.endTimeMs > timeMs
					: tenure.startTimeMs > timeMs
			)
				return []
			return [
				{
					seat: tenure.seat,
					kind: tenure.kind,
					ward: tenure.ward,
					startTimeMs: tenure.startTimeMs,
					endTimeMs: until(tenure.endTimeMs, timeMs),
					person: tenure.person,
					startReason: tenure.startReason,
					endReason:
						until(tenure.endTimeMs, timeMs) === null ? null : tenure.endReason,
				},
			]
		})
	return {
		...person,
		residence: residenceAt({ people, id, timeMs }),
		father: PEOPLE_RECORD.has({ people, id: person.father })
			? person.father
			: -1,
		mother: PEOPLE_RECORD.has({ people, id: person.mother })
			? person.mother
			: -1,
		deathTimeMs: until(person.deathTimeMs, timeMs),
		spouses,
		betrothals,
		children: (people.childrenOf.get(id) ?? []).filter(bornBy),
		siblings: [
			...new Set(
				[person.father, person.mother].flatMap(
					(parent) => people.childrenOf.get(parent) ?? [],
				),
			),
		].filter((sibling) => sibling !== id && bornBy(sibling)),
		tenures: tenureViews(people.tenuresOf.get(id) ?? []),
		predecessors: tenureViews(
			(people.tenuresOf.get(id) ?? []).flatMap((index) => {
				const tenure = people.tenures[index]
				if (
					tenure.kind === "regent" ||
					tenure.startTimeMs === null ||
					tenure.startTimeMs > timeMs
				)
					return []
				return (people.tenuresOfSeat.get(tenure.seat) ?? []).filter(
					(prior) =>
						prior !== index &&
						people.tenures[prior].endTimeMs === tenure.startTimeMs,
				)
			}),
		),
		regents: tenureViews(people.regentsOfWard.get(id) ?? []),
	}
}

function timeline(params: PersonAtParams): PersonEvent[] {
	const person = view(params)
	if (!person) return []
	const events: PersonEvent[] = [
		{ timeMs: person.birthTimeMs, kind: "born", other: -1, tenure: -1 },
	]
	for (const spouse of person.spouses)
		events.push({
			timeMs: spouse.startTimeMs,
			kind: "married",
			other: spouse.person,
			tenure: -1,
		})
	for (const betrothal of person.betrothals) {
		events.push({
			timeMs: betrothal.startTimeMs,
			kind: "betrothed",
			other: betrothal.person,
			tenure: -1,
		})
		if (
			betrothal.endTimeMs !== null &&
			(betrothal.cause === "alliance" || betrothal.cause === "kinship")
		)
			events.push({
				timeMs: betrothal.endTimeMs,
				kind:
					betrothal.cause === "kinship"
						? "betrothal broken for kinship"
						: "betrothal broken",
				other: betrothal.person,
				tenure: -1,
			})
	}
	for (const child of person.children)
		events.push({
			timeMs: PEOPLE_RECORD.birthTimeMs({ people: params.people, id: child }),
			kind: "child born",
			other: child,
			tenure: -1,
		})
	for (const residence of params.people.residencesOf.get(params.id) ?? [])
		if (residence.timeMs <= params.timeMs)
			events.push({
				timeMs: residence.timeMs,
				kind: "moved",
				other: residence.province,
				tenure: -1,
			})

	for (const [index, tenure] of person.tenures.entries()) {
		const regent = tenure.kind === "regent"
		if (tenure.startTimeMs !== null)
			events.push({
				timeMs: tenure.startTimeMs,
				kind: regent ? "became regent" : "took seat",
				other: tenure.seat,
				tenure: index,
				...(regent ? {} : { reason: tenure.startReason }),
			})
		if (tenure.endTimeMs !== null && tenure.endTimeMs !== person.deathTimeMs)
			events.push({
				timeMs: tenure.endTimeMs,
				kind: regent ? "left regency" : "left seat",
				other: tenure.seat,
				tenure: index,
				...(tenure.endReason ? { reason: tenure.endReason } : {}),
			})
	}
	for (const [index, regency] of person.regents.entries())
		events.push({
			timeMs: regency.startTimeMs,
			kind: "regent appointed",
			other: regency.person,
			tenure: index,
		})
	const blind = PEOPLE_LOG.conditions.indexOf("blind")
	const incapable = PEOPLE_LOG.conditions.indexOf("incapable")
	const levels = PEOPLE_LOG.conditions.map(() => -1)
	for (const row of PEOPLE_RECORD.healthRows(params)) {
		if (row.code === 0) continue
		const condition = row.code - 1
		const before = levels[condition]
		levels[condition] = row.value
		if (row.timeMs > params.timeMs) break
		events.push({
			timeMs: row.timeMs,
			kind:
				condition === blind
					? "became blind"
					: condition === incapable
						? "became incapable"
						: row.value < 0
							? "condition lost"
							: before < 0
								? "condition gained"
								: "condition worsened",
			other: condition,
			tenure: -1,
		})
	}
	for (const pregnancy of params.people.pregnanciesOf.get(params.id) ?? []) {
		if (pregnancy.timeMs > params.timeMs) continue
		if (pregnancy.outcome === "childbirth death") continue
		events.push({
			timeMs: pregnancy.timeMs,
			kind:
				pregnancy.outcome === "miscarriage" ? "miscarriage" : "stillborn child",
			other: pregnancy.father,
			tenure: -1,
		})
	}
	if (person.deathTimeMs !== null)
		events.push({
			timeMs: person.deathTimeMs,
			kind: DEATH_EVENTS[PEOPLE_RECORD.deathCause(params)],
			other: -1,
			tenure: -1,
		})
	return events.sort((a, b) => a.timeMs - b.timeMs)
}

// The recorded band at that time: the latest change, else the band the
// person was created with. Null before that creation, when no health is
// known, and for the unborn and the dead.
function health({ people, id, timeMs }: PersonAtParams): HealthBand | null {
	const person = PEOPLE_RECORD.person({ people, id })
	if (!person || person.birthTimeMs > timeMs || person.deathTimeMs <= timeMs)
		return null
	const changed = PEOPLE_RECORD.healthAt({ people, id, timeMs, code: 0 })
	if (changed !== null) return PEOPLE_LOG.healthBands[changed]
	return timeMs >= people.persons.healthTimeMs[id]
		? PEOPLE_LOG.healthBands[people.persons.healthBand[id]]
		: null
}

// Each condition's recorded level at that time, in code order; -1 when
// absent. The living only: the dead and the unborn have none.
function conditionLevels({ people, id, timeMs }: PersonAtParams): number[] {
	const levels = PEOPLE_LOG.conditions.map(() => -1)
	const person = PEOPLE_RECORD.person({ people, id })
	if (!person || person.birthTimeMs > timeMs) return levels
	const at = Math.min(timeMs, person.deathTimeMs)
	for (const row of PEOPLE_RECORD.healthRows({ people, id })) {
		if (row.timeMs > at) break
		if (row.code > 0) levels[row.code - 1] = row.value
	}
	return levels
}

function conditions(params: PersonAtParams): ConditionView[] {
	return conditionLevels(params).flatMap((level, index) =>
		level < 0 ? [] : [{ condition: PEOPLE_LOG.conditions[index], level }],
	)
}

// Null while the person lives.
function deathCause({ people, id, timeMs }: PersonAtParams): DeathCause | null {
	const person = PEOPLE_RECORD.person({ people, id })
	return person && person.deathTimeMs <= timeMs
		? PEOPLE_RECORD.deathCause({ people, id })
		: null
}

function married({ people, a, b, timeMs }: CoupleAtParams): boolean {
	return (people.marriagesOf.get(a) ?? []).some((index) => {
		const marriage = people.marriages[index]
		return (
			(marriage.husband === b || marriage.wife === b) &&
			marriage.startTimeMs <= timeMs
		)
	})
}

function holder({ people, seat, timeMs }: SeatAtParams): number {
	const tenures = people.tenuresOfSeat.get(seat) ?? []
	for (let i = tenures.length - 1; i >= 0; i--) {
		const tenure = people.tenures[tenures[i]]
		if (tenure.startTimeMs !== null && tenure.startTimeMs <= timeMs)
			return tenure.endTimeMs > timeMs ? tenure.person : -1
	}
	return -1
}

function attributes({ people, id, timeMs }: PersonAtParams): AttributeView[] {
	const person = PEOPLE_RECORD.person({ people, id })
	if (
		!person ||
		timeMs < person.birthTimeMs ||
		people.persons.createdTimeMs[id] > timeMs
	)
		return []
	const age =
		(Math.min(timeMs, person.deathTimeMs) - person.birthTimeMs) / yearMs
	const effects = AGEING.effects(conditionLevels({ people, id, timeMs }))
	return (
		[
			"diplomacy",
			"martial",
			"stewardship",
			"intrigue",
			"learning",
			"prowess",
		] as const
	).map((name) => {
		const value = ATTRIBUTES.effective({
			conditions: [effects.attributes],
			character: person,
			age,
			attribute: name,
		})
		return { name, value, tier: ATTRIBUTES.tier(value) }
	})
}
function traits({ people, id, timeMs }: PersonAtParams): TraitsView | null {
	const person = PEOPLE_RECORD.person({ people, id })
	if (
		!person ||
		timeMs < person.birthTimeMs ||
		people.persons.createdTimeMs[id] > timeMs
	)
		return null
	const age =
		(Math.min(timeMs, person.deathTimeMs) - person.birthTimeMs) / yearMs
	return {
		personality: TRAITS.active({ character: person, age }),
		congenital: TRAITS.congenital({ character: person, age }),
		grades: TRAITS.labels({ character: person, age }),
	}
}
function stress({ people, id, timeMs }: PersonAtParams): number {
	let level = 0
	for (const row of people.stressOf.get(id) ?? [])
		if (row.timeMs <= timeMs) level = row.level
	return level
}
function residenceAt({ people, id, timeMs }: PersonAtParams): number {
	const person = PEOPLE_RECORD.person({ people, id })
	if (
		!person ||
		timeMs < person.birthTimeMs ||
		people.persons.createdTimeMs[id] > timeMs
	)
		return -1
	const rows = people.residencesOf.get(id) ?? []
	const index = EFFECTIVE_TIME.latest({
		times: rows.map((row) => row.timeMs),
		length: rows.length,
		time: timeMs,
	})
	return index < 0 ? person.initialResidence : rows[index].province
}

function realmAt({ people, id, timeMs, record }: RealmAtParams): number {
	const province = residenceAt({ people, id, timeMs })
	return province < 0 ? -1 : AFFILIATION.at({ record, province, timeMs })
}

// The latest refresh of each reason at or before the time; a later arrival
// wins a tie.
function memoriesAt({ people, a, b, timeMs }: CoupleAtParams): RecordMemory[] {
	const latest = new Map<OpinionMemoryReason, RecordMemory>()
	for (const row of people.memoriesOf.get(a)?.get(b) ?? []) {
		if (row.startTimeMs > timeMs) continue
		const held = latest.get(row.reason)
		if (!held || row.startTimeMs >= held.startTimeMs)
			latest.set(row.reason, row)
	}
	return [...latest.values()]
}

// Everyone the person remembers or is remembered by, from refreshes made by
// the time.
function memoryPartners({ people, id, timeMs }: PersonAtParams): number[] {
	const partners = new Set<number>()
	const begun = (rows: RecordMemory[]) =>
		rows.some((row) => row.startTimeMs <= timeMs)
	for (const [target, rows] of people.memoriesOf.get(id) ?? [])
		if (begun(rows)) partners.add(target)
	for (const [observer, targets] of people.memoriesOf) {
		const rows = targets.get(id)
		if (rows && begun(rows)) partners.add(observer)
	}
	return [...partners]
}

function memories(params: CoupleAtParams): MemoryView[] {
	return memoriesAt(params).map((row) => ({
		reason: row.reason,
		startTimeMs: row.startTimeMs,
		strength: OPINION_MEMORY.contribution({
			memory: { reason: row.reason, start: row.startTimeMs / yearMs },
			time: params.timeMs / yearMs,
		}),
	}))
}

function opinionContext({
	people,
	record,
	timeMs,
}: OpinionContextParams): OpinionContext {
	const personOf = (id: number): OpinionPerson | null => {
		const person = PEOPLE_RECORD.person({ people, id })
		if (
			!person ||
			person.birthTimeMs > timeMs ||
			people.persons.createdTimeMs[id] > timeMs
		)
			return null
		const realm = realmAt({ people, id, timeMs, record })
		const capital =
			record.events.nationEvents[realm]?.base.capitalProvinceId ?? -1
		const sovereignSeats: number[] = []
		const districtSovereigns: number[] = []
		for (const index of people.tenuresOf.get(id) ?? []) {
			const tenure = people.tenures[index]
			if (
				tenure.kind === "regent" ||
				tenure.startTimeMs === null ||
				tenure.startTimeMs > timeMs ||
				tenure.endTimeMs <= timeMs ||
				holder({ people, seat: tenure.seat, timeMs }) !== id
			)
				continue
			const node = AFFILIATION.nodeAt({
				record,
				province: tenure.seat,
				timeMs,
				inclusive: true,
			})
			if (!node || node.owner < 0) continue
			if (node.parent < 0) sovereignSeats.push(tenure.seat)
			else {
				const parent = AFFILIATION.nodeAt({
					record,
					province: node.parent,
					timeMs,
					inclusive: true,
				})
				if (parent && parent.parent < 0 && parent.owner >= 0)
					districtSovereigns.push(node.parent)
			}
		}
		return {
			id,
			character: person,
			age: (Math.min(timeMs, person.deathTimeMs) - person.birthTimeMs) / yearMs,
			culture: person.culture,
			heritage:
				person.culture >= 0
					? (record.heritageOfCulture[person.culture] ?? -1)
					: -1,
			religion:
				capital >= 0
					? (AFFILIATION.nodeAt({
							record,
							province: capital,
							timeMs,
							inclusive: true,
						})?.religion ?? -1)
					: -1,
			sovereignSeats,
			districtSovereigns,
		}
	}
	return {
		personOf,
		kinship: people.persons,
		married: ({ a, b }) =>
			PEOPLE_RECORD.deathTimeMs({ people, id: a }) > timeMs &&
			PEOPLE_RECORD.deathTimeMs({ people, id: b }) > timeMs &&
			married({ people, a, b, timeMs }),
		memoriesOf: ({ observer, target }) =>
			memoriesAt({ people, a: observer, b: target, timeMs }).map((row) => ({
				reason: row.reason,
				start: row.startTimeMs / yearMs,
			})),
	}
}

function opinion({
	people,
	a,
	b,
	timeMs,
	record,
}: OpinionQueryParams): OpinionBreakdown | null {
	return OPINION.of({
		observer: a,
		target: b,
		time: timeMs / yearMs,
		context: opinionContext({ people, record, timeMs }),
	})
}

// Noble popularity of the realm seated at `seat`: its ruler as seen by the
// holders of the districts directly under it then.
function popularity({
	people,
	record,
	seat,
	timeMs,
}: PopularityQueryParams): Popularity {
	const holders: number[] = []
	for (const district of people.tenuresOfSeat.keys()) {
		const person = holder({ people, seat: district, timeMs })
		if (
			person >= 0 &&
			AFFILIATION.nodeAt({
				record,
				province: district,
				timeMs,
				inclusive: true,
			})?.parent === seat
		)
			holders.push(person)
	}
	return OPINION.popularity({
		ruler: holder({ people, seat, timeMs }),
		holders,
		time: timeMs / yearMs,
		context: opinionContext({ people, record, timeMs }),
	})
}

export const PERSON_QUERY = {
	opinion,
	memories,
	memoryPartners,
	popularity,
	residenceAt,
	realmAt,
	attributes,
	traits,
	stress,
	conditions,
	deathCause,
	view,
	timeline,
	married,
	holder,
	health,
}
