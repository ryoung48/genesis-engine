import { PEOPLE_RECORD } from "@/model/history/record/people"
import type {
	HealthSeriesPoint,
	HoldsSeatParams,
	KinRow,
	LifeRowsParams,
	LifeSpan,
	PersonTimelineParams,
	PersonTimelineRow,
	TitlesGainedRow,
	TitlesLostRow,
	WithinParams,
} from "@/model/history/record/people/query/timeline/types"
import type { TenureView } from "@/model/history/record/people/types"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"

const UNSET = -1
const SAME_INSTANT_MS = 1000
const GROUP_ORDER = { life: 0, family: 1, titles: 2 }

function lifeSpan({ state, person }: PersonTimelineParams): LifeSpan {
	const record = state.record.people
	const death = record.death[person]
	return {
		startMs: record.birth[person],
		endMs: Number.isFinite(death) ? death : state.record.maxTimeMs,
	}
}

function within({ span, timeMs }: WithinParams): boolean {
	return timeMs >= span.startMs && timeMs <= span.endMs
}

function holdsSeat({ tenures, seat, timeMs }: HoldsSeatParams): boolean {
	return tenures.some(
		(tenure) =>
			tenure.seat === seat &&
			tenure.startMs <= timeMs &&
			(tenure.endMs === null || tenure.endMs >= timeMs),
	)
}

function lifeRows({
	state,
	person,
	span,
}: LifeRowsParams): PersonTimelineRow[] {
	const record = state.record.people
	const rows: PersonTimelineRow[] = []
	rows.push({
		id: `${person}:born`,
		timeMs: record.birth[person],
		group: "life",
		kind: "born",
		father: record.father[person] === UNSET ? null : record.father[person],
		mother: record.mother[person] === UNSET ? null : record.mother[person],
	})
	const points = PEOPLE_RECORD.health({ record, person })
	for (let i = 1; i < points.length; i++) {
		const fromBand = LIFESPAN.healthBand(points[i - 1].health)
		const toBand = LIFESPAN.healthBand(points[i].health)
		if (toBand >= fromBand || !within({ span, timeMs: points[i].timeMs }))
			continue
		rows.push({
			id: `${person}:health:${i}`,
			timeMs: points[i].timeMs,
			group: "life",
			kind: "health-declined",
			fromBand,
			toBand,
		})
	}
	const death = record.death[person]
	const cause = PEOPLE_RECORD.deathCauseOf({ record, person })
	if (Number.isFinite(death) && cause)
		rows.push({
			id: `${person}:died`,
			timeMs: death,
			group: "life",
			kind: "died",
			ageYears: (death - record.birth[person]) / PEOPLE_RECORD.yearMs,
			deathHealth: record.deathHealth[person],
			cause,
			inOffice: PEOPLE_RECORD.tenuresOfPerson({ record, person }).some(
				(tenure) =>
					tenure.endMs === null ||
					Math.abs(tenure.endMs - death) <= SAME_INSTANT_MS,
			),
		})
	return rows
}

function kinOf({ state, person }: PersonTimelineParams): KinRow[] {
	const record = state.record.people
	const kin: KinRow[] = []
	const father = record.father[person]
	const mother = record.mother[person]
	if (father !== UNSET) kin.push({ kin: father, relation: "father" })
	if (mother !== UNSET) kin.push({ kin: mother, relation: "mother" })
	for (const marriage of PEOPLE_RECORD.marriages({ record, person }))
		kin.push({
			kin: record.sex[person] === 0 ? marriage.wife : marriage.husband,
			relation: "spouse",
		})
	for (const child of PEOPLE_RECORD.children({ record, person }))
		kin.push({ kin: child, relation: "child" })
	const siblings = new Set<number>()
	for (const parent of [father, mother])
		if (parent !== UNSET)
			for (const child of PEOPLE_RECORD.children({ record, person: parent }))
				if (child !== person) siblings.add(child)
	for (const sibling of siblings)
		kin.push({
			kin: sibling,
			relation:
				father !== UNSET &&
				mother !== UNSET &&
				record.father[sibling] === father &&
				record.mother[sibling] === mother
					? "sibling"
					: "half-sibling",
		})
	return kin
}

function familyRows({
	state,
	person,
	span,
}: LifeRowsParams): PersonTimelineRow[] {
	const record = state.record.people
	const rows: PersonTimelineRow[] = []
	for (const [index, marriage] of PEOPLE_RECORD.marriages({
		record,
		person,
	}).entries())
		if (within({ span, timeMs: marriage.startMs }))
			rows.push({
				id: `${person}:married:${index}`,
				timeMs: marriage.startMs,
				group: "family",
				kind: "married",
				spouse: record.sex[person] === 0 ? marriage.wife : marriage.husband,
			})
	for (const { kin, relation } of kinOf({ state, person })) {
		if (relation === "child" && within({ span, timeMs: record.birth[kin] }))
			rows.push({
				id: `${person}:child-born:${kin}`,
				timeMs: record.birth[kin],
				group: "family",
				kind: "child-born",
				child: kin,
			})
		if (
			(relation === "sibling" || relation === "half-sibling") &&
			record.birth[kin] > span.startMs &&
			within({ span, timeMs: record.birth[kin] })
		)
			rows.push({
				id: `${person}:sibling-born:${kin}`,
				timeMs: record.birth[kin],
				group: "family",
				kind: "sibling-born",
				sibling: kin,
				relation,
			})
		const death = record.death[kin]
		if (Number.isFinite(death) && within({ span, timeMs: death }))
			rows.push({
				id: `${person}:kin-died:${relation}:${kin}`,
				timeMs: death,
				group: "family",
				kind: "kin-died",
				kin,
				relation,
			})
	}
	return rows
}

function tenureRows({
	state,
	person,
	span,
}: LifeRowsParams): PersonTimelineRow[] {
	const record = state.record.people
	const rows: PersonTimelineRow[] = []
	const tenures = PEOPLE_RECORD.tenuresOfPerson({ record, person })
	const death = record.death[person]
	const moved = new Set<TenureView>()
	for (const tenure of tenures) {
		const endMs = tenure.endMs
		if (endMs === null) continue
		if (Number.isFinite(death) && Math.abs(endMs - death) <= SAME_INSTANT_MS)
			continue
		const next = tenures.find(
			(other) =>
				other !== tenure && Math.abs(other.startMs - endMs) <= SAME_INSTANT_MS,
		)
		if (next) {
			moved.add(next)
			rows.push({
				id: `${person}:seat-moved:${tenure.seat}:${next.seat}`,
				timeMs: endMs,
				group: "titles",
				kind: "seat-moved",
				fromSeat: tenure.seat,
				toSeat: next.seat,
			})
		} else
			rows.push({
				id: `${person}:tenure-lost:${tenure.seat}:${tenure.startMs}`,
				timeMs: endMs,
				group: "titles",
				kind: "tenure-lost",
				seat: tenure.seat,
			})
	}
	for (const tenure of tenures) {
		if (moved.has(tenure)) continue
		const holders = PEOPLE_RECORD.tenuresOfSeat({ record, seat: tenure.seat })
		const index = holders.findIndex(
			(holder) => holder.person === person && holder.startMs === tenure.startMs,
		)
		const previous = index > 0 ? holders[index - 1].person : null
		rows.push({
			id: `${person}:tenure-start:${tenure.seat}:${tenure.startMs}`,
			timeMs: tenure.startMs,
			group: "titles",
			kind: "tenure-start",
			seat: tenure.seat,
			previousHolder: previous === person ? null : previous,
			sinceRecordStart: tenure.startMs <= state.record.minTimeMs,
		})
	}
	return rows.filter((row) => within({ span, timeMs: row.timeMs }))
}

function titleRows({
	state,
	person,
	span,
}: LifeRowsParams): PersonTimelineRow[] {
	const record = state.record.people
	const base = state.record.titles
	if (!base) return []
	const tenures = PEOPLE_RECORD.tenuresOfPerson({ record, person })
	if (tenures.length === 0) return []
	const rows: PersonTimelineRow[] = []
	const holder = new Map<number, number>()
	for (let title = 0; title < base.count; title++)
		holder.set(title, base.holder[title])
	const gained = new Map<string, TitlesGainedRow>()
	const lost = new Map<string, TitlesLostRow>()
	for (const [index, event] of state.record.events.titleEvents.entries()) {
		const inLife =
			event.timeMs > state.record.minTimeMs &&
			within({ span, timeMs: event.timeMs })
		if (event.kind === "passed") {
			holder.set(event.title, event.to)
			const receives = holdsSeat({
				tenures,
				seat: event.to,
				timeMs: event.timeMs,
			})
			const gives = holdsSeat({
				tenures,
				seat: event.from,
				timeMs: event.timeMs,
			})
			if (receives === gives || !inLife) continue
			const key = `${event.timeMs}:${event.from}:${event.to}`
			const existing = (receives ? gained : lost).get(key)
			if (existing) existing.titles.push(event.title)
			else if (receives)
				gained.set(key, {
					id: `${person}:gained:${index}`,
					timeMs: event.timeMs,
					group: "titles",
					kind: "titles-gained",
					titles: [event.title],
					fromSeat: event.from,
					toSeat: event.to,
					cause: event.cause,
				})
			else
				lost.set(key, {
					id: `${person}:lost:${index}`,
					timeMs: event.timeMs,
					group: "titles",
					kind: "titles-lost",
					titles: [event.title],
					fromSeat: event.from,
					toSeat: event.to === UNSET ? null : event.to,
					cause: event.cause,
				})
		} else if (event.kind === "created") {
			holder.set(event.title, event.holder)
			if (
				inLife &&
				holdsSeat({ tenures, seat: event.holder, timeMs: event.timeMs })
			)
				rows.push({
					id: `${person}:founded:${index}`,
					timeMs: event.timeMs,
					group: "titles",
					kind: "title-founded",
					title: event.title,
					seat: event.seat,
				})
		} else if (event.kind === "destroyed") {
			const seat = holder.get(event.title) ?? UNSET
			holder.set(event.title, UNSET)
			if (inLife && holdsSeat({ tenures, seat, timeMs: event.timeMs }))
				rows.push({
					id: `${person}:dissolved:${index}`,
					timeMs: event.timeMs,
					group: "titles",
					kind: "title-dissolved",
					title: event.title,
				})
		}
	}
	return [...rows, ...gained.values(), ...lost.values()]
}

function build({ state, person }: PersonTimelineParams): PersonTimelineRow[] {
	if (!PEOPLE_RECORD.has({ record: state.record.people, person })) return []
	const params = { state, person, span: lifeSpan({ state, person }) }
	return [
		...lifeRows(params),
		...familyRows(params),
		...tenureRows(params),
		...titleRows(params),
	].sort(
		(a, b) =>
			a.timeMs - b.timeMs ||
			GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
			a.id.localeCompare(b.id),
	)
}

function healthSeries({
	state,
	person,
}: PersonTimelineParams): HealthSeriesPoint[] {
	const record = state.record.people
	const points = PEOPLE_RECORD.health({ record, person }).map((point) => ({
		timeMs: point.timeMs,
		band: LIFESPAN.healthBand(point.health),
	}))
	if (points.length === 0) return []
	const death = record.death[person]
	points.push({
		timeMs: Number.isFinite(death) ? death : state.record.maxTimeMs,
		band: points[points.length - 1].band,
	})
	return points
}

export const PERSON_TIMELINE = { build, healthSeries }
