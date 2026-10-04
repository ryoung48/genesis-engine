import { PEOPLE_RECORD } from "@/model/history/record/people"
import { AFFILIATION } from "@/model/history/record/people/query/affiliation"
import type { AffiliationRecord } from "@/model/history/record/people/query/affiliation/types"
import type {
	BoundParams,
	BuildHouseholdsParams,
	HouseholdsReport,
	IngestTerritoryParams,
	OccupancyInterval,
	ResidenceReport,
	ResidenceReportParams,
	TerritoryParams,
} from "@/test/history-run/report/households/types"

function build({
	people,
	samples,
	fromMs,
	toMs,
	final,
}: BuildHouseholdsParams): HouseholdsReport {
	const histogram: [number, number, number] = [0, 0, 0]
	let seatsTotal = 0
	let multiple = 0
	const selected = samples.filter(
		(sample) =>
			sample.timeMs >= fromMs &&
			(sample.timeMs < toMs || (final && sample.timeMs === toMs)),
	)
	for (let id = 0; id < PEOPLE_RECORD.count(people); id++) {
		const person = PEOPLE_RECORD.person({ people, id })
		if (!person) continue
		const tenures = (people.tenuresOf.get(id) ?? [])
			.map((index) => people.tenures[index])
			.filter((tenure) => tenure.kind !== "regent")
		for (const sample of selected) {
			if (
				person.birthTimeMs > sample.timeMs ||
				person.deathTimeMs <= sample.timeMs
			)
				continue
			const seats = new Set(
				tenures
					.filter(
						(tenure) =>
							tenure.startTimeMs !== null &&
							tenure.startTimeMs <= sample.timeMs &&
							tenure.endTimeMs > sample.timeMs,
					)
					.map((tenure) => tenure.seat),
			)
			histogram[Math.min(2, seats.size)]++
			const crowns = [...seats].filter((seat) =>
				sample.sovereigns.has(seat),
			).length
			seatsTotal += seats.size
			if (crowns > 1) multiple++
		}
	}
	return {
		heldSeatsHistogram: histogram,
		seatsPerHolder:
			histogram[1] + histogram[2] > 0
				? seatsTotal / (histogram[1] + histogram[2])
				: null,
		unionHolders: multiple,
	}
}

function territory({
	parents,
	owners,
	timeMs,
}: TerritoryParams): AffiliationRecord {
	const provinceEvents: AffiliationRecord["events"]["provinceEvents"] =
		new Map()
	for (let province = 0; province < parents.length; province++)
		provinceEvents.set(province, {
			base: {
				ownerId: owners[province] >= 0 ? province : -1,
				parentId: parents[province],
				controllerId: -1,
				cultureId: -1,
				cultureBlendSecondaryId: -1,
				religionId: -1,
				inHolyRomanEmpire: false,
			},
			events: [],
		})
	return {
		origin: "procedural",
		minTimeMs: timeMs,
		maxTimeMs: timeMs,
		events: {
			provinceEvents,
			nationEvents: Array.from(
				{ length: parents.length },
				(...entry): AffiliationRecord["events"]["nationEvents"][number] => ({
					base: {
						reforms: [],
						capitalProvinceId: entry[1],
						initialGovernment: "",
					},
					events: [],
				}),
			),
		},
	}
}

function ingestTerritory({
	territory,
	transactions,
}: IngestTerritoryParams): void {
	for (const transaction of transactions) {
		territory.maxTimeMs = Math.max(territory.maxTimeMs, transaction.timeMs)
		for (const change of transaction.parents)
			territory.events.provinceEvents.get(change.province)?.events.push({
				timeMs: transaction.timeMs,
				kind: "parent",
				payload: { parentId: change.after },
				comment: null,
			})
	}
}

function bound({ values, time, inclusive }: BoundParams): number {
	let low = 0
	let high = values.length
	while (low < high) {
		const middle = (low + high) >>> 1
		if (values[middle] < time || (inclusive && values[middle] === time))
			low = middle + 1
		else high = middle
	}
	return low
}

function residence({
	people,
	territory,
	windows,
}: ResidenceReportParams): ResidenceReport[] {
	const result = windows.map(() => ({
		residenceRows: 0,
		sameResidenceRealmChanges: 0,
	}))
	const occupancy = new Map<number, OccupancyInterval[]>()
	const windowOf = (time: number) =>
		windows.findIndex(
			(window) =>
				time >= window.fromMs &&
				(time < window.toMs || (window.final && time === window.toMs)),
		)
	for (let id = 0; id < PEOPLE_RECORD.count(people); id++) {
		const person = PEOPLE_RECORD.person({ people, id })
		if (!person) continue
		let province = person.initialResidence
		let start = Math.max(person.birthTimeMs, territory.minTimeMs)
		const end = Math.min(person.deathTimeMs, territory.maxTimeMs)
		const rows = people.residencesOf.get(id) ?? []
		const retain = (until: number) => {
			if (province < 0 || start >= until) return
			const intervals = occupancy.get(province) ?? []
			intervals.push({
				start,
				end: until,
				endIncluded:
					until === territory.maxTimeMs && person.deathTimeMs > until,
			})
			occupancy.set(province, intervals)
		}
		for (let index = 0; index < rows.length; ) {
			const time = rows[index].timeMs
			let changed = false
			let next = province
			while (index < rows.length && rows[index].timeMs === time) {
				const row = rows[index++]
				const window = windowOf(time)
				if (window >= 0) result[window].residenceRows++
				if (row.province !== next) changed = true
				next = row.province
			}
			if (changed) {
				retain(Math.min(time, end))
				province = next
				start = Math.max(time, start)
			}
		}
		retain(end)
	}
	const timelines = AFFILIATION.transitions({ record: territory })
	for (const [province, intervals] of occupancy) {
		const starts = intervals
			.map((interval) => interval.start)
			.sort((a, b) => a - b)
		const ends = intervals
			.filter((interval) => !interval.endIncluded)
			.map((interval) => interval.end)
			.sort((a, b) => a - b)
		for (const transition of timelines.get(province) ?? []) {
			const window = windowOf(transition.timeMs)
			if (window < 0) continue
			const count =
				bound({ values: starts, time: transition.timeMs, inclusive: false }) -
				bound({ values: ends, time: transition.timeMs, inclusive: true })
			result[window].sameResidenceRealmChanges += Math.max(0, count)
		}
	}
	return result
}

export const HOUSEHOLDS_REPORT = {
	build,
	territory,
	ingestTerritory,
	residence,
}
