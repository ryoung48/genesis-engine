import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_TIMELINE } from "@/model/history/record/people/query/timeline"
import type {
	HealthAt,
	PersonAtParams,
	PersonPage,
	PersonPageParams,
	PersonRef,
	PersonRefParams,
	PersonStatus,
	SiblingsParams,
	SpouseMarriage,
	SpouseRef,
	SpousesParams,
	Tenure,
	TitleRef,
	TitlesAtParams,
} from "@/model/history/record/people/query/types"
import { TITLE_RECORD } from "@/model/history/record/titles"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"

const UNSET = -1

function statusAt({ state, person, timeMs }: PersonAtParams): PersonStatus {
	const record = state.record.people
	if (record.birth[person] > timeMs) return "unborn"
	return record.death[person] <= timeMs ? "dead" : "alive"
}

function refOf({
	state,
	names,
	person,
	timeMs,
	relation,
}: PersonRefParams): PersonRef {
	const record = state.record.people
	const status = statusAt({ state, person, timeMs })
	const sex = record.sex[person] as 0 | 1
	const death = record.death[person]
	return {
		id: person,
		name: names.person({
			personId: person,
			culture: record.culture[person],
			sex,
		}),
		sex,
		dynasty: record.dynasty[person],
		birthMs: record.birth[person],
		deathMs: Number.isFinite(death) ? death : null,
		dimmed: status !== "alive",
		dimReason: status === "alive" ? null : status,
		relation,
	}
}

function byBirth(state: PersonPageParams["state"]) {
	const record = state.record.people
	return (a: number, b: number): number =>
		record.birth[a] - record.birth[b] || a - b
}

function healthAt({ state, person, timeMs }: PersonAtParams): HealthAt {
	const record = state.record.people
	if (record.death[person] <= timeMs)
		return {
			band: LIFESPAN.healthBand(record.deathHealth[person]),
			sinceMs: null,
		}
	const points = PEOPLE_RECORD.health({ record, person })
	let index = -1
	for (let i = 0; i < points.length && points[i].timeMs <= timeMs; i++)
		index = i
	if (index < 0)
		return {
			band: points.length > 0 ? LIFESPAN.healthBand(points[0].health) : 0,
			sinceMs: null,
		}
	const beganBeforeRecord =
		index === 0 && record.birth[person] < state.record.minTimeMs
	return {
		band: LIFESPAN.healthBand(points[index].health),
		sinceMs: beganBeforeRecord ? null : points[index].timeMs,
	}
}

function spousesOf({
	state,
	names,
	person,
	timeMs,
}: SpousesParams): SpouseRef[] {
	const record = state.record.people
	const rank = { active: 0, former: 1, future: 2 }
	const spouses = PEOPLE_RECORD.marriages({ record, person }).map(
		(marriage) => {
			const spouse = record.sex[person] === 0 ? marriage.wife : marriage.husband
			const marriageState: SpouseMarriage["state"] =
				marriage.startMs > timeMs
					? "future"
					: marriage.endMs !== null && marriage.endMs <= timeMs
						? "former"
						: "active"
			const view: SpouseMarriage = {
				startMs: marriage.startMs,
				endMs: marriage.endMs,
				reason: marriage.reason,
				state: marriageState,
			}
			return {
				...refOf({ state, names, person: spouse, timeMs, relation: "spouse" }),
				marriage: view,
			}
		},
	)
	return spouses.sort(
		(a, b) =>
			rank[a.marriage.state] - rank[b.marriage.state] ||
			a.marriage.startMs - b.marriage.startMs,
	)
}

function siblingsOf({
	state,
	names,
	person,
	timeMs,
}: SiblingsParams): PersonRef[] {
	const record = state.record.people
	const father = record.father[person]
	const mother = record.mother[person]
	const found = new Set<number>()
	for (const parent of [father, mother])
		if (parent >= 0)
			for (const child of PEOPLE_RECORD.children({ record, person: parent }))
				if (child !== person) found.add(child)
	return [...found].sort(byBirth(state)).map((sibling) => {
		const full =
			father >= 0 &&
			mother >= 0 &&
			record.father[sibling] === father &&
			record.mother[sibling] === mother
		return refOf({
			state,
			names,
			person: sibling,
			timeMs,
			relation: full ? "sibling" : "half-sibling",
		})
	})
}

function seatsHeld({ state, person, timeMs }: PersonAtParams): Set<number> {
	const held = new Set<number>()
	for (const tenure of PEOPLE_RECORD.tenuresOfPerson({
		record: state.record.people,
		person,
	}))
		if (
			tenure.startMs <= timeMs &&
			(tenure.endMs === null || tenure.endMs > timeMs)
		)
			held.add(tenure.seat)
	return held
}

function titlesAt({
	state,
	frame,
	person,
	timeMs,
}: TitlesAtParams): TitleRef[] {
	const titles = frame.titles
	if (!titles) return []
	const held = seatsHeld({ state, person, timeMs })
	const refs: TitleRef[] = []
	if (held.size === 0) return refs
	for (let title = 0; title < titles.count; title++) {
		if (!held.has(titles.holder[title])) continue
		const realm = TITLE_RECORD.realmOf({ frame, holder: titles.holder[title] })
		refs.push({
			title,
			tier: titles.tier[title],
			seat: titles.seat[title],
			realmNationId: realm >= 0 ? realm : null,
		})
	}
	return refs.sort((a, b) => b.tier - a.tier || a.title - b.title)
}

function tenuresUpTo({ state, person, timeMs }: PersonAtParams): Tenure[] {
	return PEOPLE_RECORD.tenuresOfPerson({
		record: state.record.people,
		person,
	})
		.filter((tenure) => tenure.startMs <= timeMs)
		.map((tenure) => {
			const realm = TITLE_RECORD.realmAt({
				record: state.record,
				holder: tenure.seat,
				timeMs: tenure.startMs,
			})
			return {
				seat: tenure.seat,
				startMs: tenure.startMs,
				endMs: tenure.endMs,
				sinceRecordStart: tenure.startMs <= state.record.minTimeMs,
				realmNationId: realm >= 0 ? realm : null,
			}
		})
}

function page({
	state,
	frame,
	names,
	person,
	timeMs,
}: PersonPageParams): PersonPage | null {
	const record = state.record.people
	if (!PEOPLE_RECORD.has({ record, person })) return null
	const sex = record.sex[person] as 0 | 1
	const culture = record.culture[person]
	const dynasty = record.dynasty[person]
	const status = statusAt({ state, person, timeMs })
	const death = record.death[person]
	const dead = status === "dead"
	const health = healthAt({ state, person, timeMs })
	const parents: PersonRef[] = []
	for (const [parent, relation] of [
		[record.father[person], "father"],
		[record.mother[person], "mother"],
	] as const)
		if (parent !== UNSET)
			parents.push(refOf({ state, names, person: parent, timeMs, relation }))
	return {
		id: person,
		name: names.person({ personId: person, culture, sex }),
		sex,
		status,
		culture,
		dynasty,
		dynastyName: names.dynasty({
			dynastyIdx: dynasty,
			culture: record.dynastyCulture.get(dynasty) ?? UNSET,
		}),
		ageYears: Math.max(
			0,
			(Math.min(timeMs, death) - record.birth[person]) / PEOPLE_RECORD.yearMs,
		),
		birthMs: record.birth[person],
		deathMs: Number.isFinite(death) ? death : null,
		deathCause: PEOPLE_RECORD.deathCauseOf({ record, person }),
		healthBand: health.band,
		healthSinceMs: health.sinceMs,
		deathHealth: dead ? record.deathHealth[person] : null,
		titles: titlesAt({ state, frame, person, timeMs }),
		tenures: tenuresUpTo({ state, person, timeMs }),
		parents,
		spouses: spousesOf({ state, names, person, timeMs }),
		children: PEOPLE_RECORD.children({ record, person })
			.sort(byBirth(state))
			.map((child) =>
				refOf({ state, names, person: child, timeMs, relation: "child" }),
			),
		siblings: siblingsOf({ state, names, person, timeMs }),
	}
}

export const PERSON_QUERY = {
	page,
	timeline: PERSON_TIMELINE.build,
	healthSeries: PERSON_TIMELINE.healthSeries,
}
