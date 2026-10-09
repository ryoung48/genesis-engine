import { PEOPLE_RECORD } from "@/model/history/record/people"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { STATE } from "@/model/history/sim/engine/state"
import { HEALTH } from "@/model/history/sim/people/health"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import type { HealthCondition } from "@/model/history/sim/people/health/ageing/types"
import type { HealthBand } from "@/model/history/sim/people/health/types"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { DeathCause, RegencyCause } from "@/model/history/sim/people/types"
import type {
	AgeQuantiles,
	CauseReport,
	CauseWindowParams,
	CommandReport,
	ConditionAgeGroup,
	DeathReport,
	DeathWindowParams,
	IngestHealthParams,
	OnsetReport,
	PeopleHealthReport,
	PeopleHealthTracker,
	QuantilesParams,
	SampleHealthParams,
	StarterAgeGroup,
	StarterParams,
	StarterReport,
	SummarizeHealthParams,
	TrackerParams,
} from "@/test/history-run/report/people-health/types"

const ADULT_AGE = 16
const OLD_AGE = 50
const QUANTILES = [0.05, 0.25, 0.5, 0.75, 0.95]
const AGEING_CONDITIONS = 5
const BLIND = PEOPLE_LOG.conditions.indexOf("blind")
const INCAPABLE = PEOPLE_LOG.conditions.indexOf("incapable")
const AILING_HEALTH = 2.5

function noWeakCrown(): CauseReport["weakCrownYears"] {
	return { minority: 0, incapacity: 0, ailing: 0 }
}

function createTracker({ engine }: TrackerParams): PeopleHealthTracker {
	return {
		counters: { ...engine.lifecycle },
		weddings: 0,
		bandYears: PEOPLE_LOG.healthBands.map(() => 0),
		healthMs: 0,
		groupYears: [0, 0, 0],
		groupConditions: [0, 1, 2].map(() => PEOPLE_LOG.conditions.map(() => 0)),
		levelYears: Array.from({ length: AGEING_CONDITIONS }, () => [
			0, 0, 0, 0, 0,
		]),
		weakCrownYears: noWeakCrown(),
		deadSeatHolderYears: 0,
	}
}

function ingest({ tracker, transactions }: IngestHealthParams): void {
	for (const { people: packet } of transactions) {
		if (!packet) continue
		for (let index = 0; index < packet.count; index++) {
			const row = PEOPLE_LOG.read({ rows: packet, index })
			if (row.kind === "wedding") tracker.weddings++
		}
	}
}

// One sample a year: each living person's recorded band and, from 50, their
// conditions; and each sovereign realm's weak crown.
function sample({ engine, tracker }: SampleHealthParams): void {
	const people = engine.people
	const table = people.persons
	const time = engine.time / STATE.yearMs
	for (const person of people.alive) {
		if (table.death[person] <= time) continue
		tracker.bandYears[
			PEOPLE_LOG.healthBands.indexOf(HEALTH.recorded({ people, person }))
		]++
		const age = time - table.birth[person]
		if (age < OLD_AGE) continue
		const group = age < 60 ? 0 : age < 70 ? 1 : 2
		tracker.groupYears[group]++
		if (!AGEING.afflicted({ people, person })) continue
		for (const [condition, level] of AGEING.levels({
			people,
			person,
		}).entries()) {
			if (level < 0) continue
			tracker.groupConditions[group][condition]++
			if (condition < AGEING_CONDITIONS) tracker.levelYears[condition][level]++
		}
	}
	for (let realm = 0; realm < engine.P; realm++) {
		const ruler = people.rulerOf[realm]
		if (ruler >= 0 && table.death[ruler] <= time) tracker.deadSeatHolderYears++
		if (ruler < 0 || !STATE.isSovereign({ state: engine, p: realm })) continue
		const regency = GOVERNOR.regency({ state: engine, realm })
		if (regency) tracker.weakCrownYears[regency.cause]++
		else if (HEALTH.effective({ people, person: ruler, time }) < AILING_HEALTH)
			tracker.weakCrownYears.ailing++
	}
}

function quantiles({ ages }: QuantilesParams): AgeQuantiles {
	if (ages.length === 0) return null
	const sorted = [...ages].sort((a, b) => a - b)
	const [p5, p25, p50, p75, p95] = QUANTILES.map(
		(q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))],
	)
	return [p5, p25, p50, p75, p95]
}

function byBand(counts: number[]): Record<HealthBand, number> {
	return Object.fromEntries(
		PEOPLE_LOG.healthBands.map((band, index) => [band, counts[index]]),
	) as Record<HealthBand, number>
}

function byCondition<T>(values: T[]): Record<HealthCondition, T> {
	return Object.fromEntries(
		PEOPLE_LOG.conditions.map((condition, index) => [condition, values[index]]),
	) as Record<HealthCondition, T>
}

// Deaths in [from, to), with the conditions those people came by during the
// simulation, and the childhood cohort whose 16th birthday falls in the
// window: children delivered by a birth event, not people created with a
// known past.
function deaths({ record, start, from, to }: DeathWindowParams): DeathReport {
	const persons = record.persons
	const yearMs = STATE.yearMs
	const ages: [number[], number[]] = [[], []]
	const adultAges: [number[], number[]] = [[], []]
	const causes = PEOPLE_LOG.deathCauses.map(() => 0)
	const onsets = PEOPLE_LOG.conditions.map(() => 0)
	const onsetAges = PEOPLE_LOG.conditions.map(() => 0)
	let cohort = 0
	let survived = 0
	let count = 0
	let reached50 = 0
	let everBlind = 0
	let everIncapable = 0
	let incapableYears = 0
	for (let id = 0; id < PEOPLE_RECORD.count(record); id++) {
		const birth = persons.birthTimeMs[id] / yearMs
		const death = persons.deathTimeMs[id] / yearMs
		const adult = birth + ADULT_AGE
		if (
			birth >= start &&
			adult >= from &&
			adult < to &&
			Math.abs(persons.healthTimeMs[id] - persons.birthTimeMs[id]) < 1
		) {
			cohort++
			if (death > adult) survived++
		}
		if (death < from || death >= to) continue
		count++
		causes[persons.deathCause[id]]++
		const age = death - birth
		ages[persons.sex[id]].push(age)
		if (age >= ADULT_AGE) adultAges[persons.sex[id]].push(age)
		const snapshot = persons.healthTimeMs[id]
		if (snapshot === Infinity) continue
		if (age > OLD_AGE) reached50++
		const seen = new Set<number>()
		for (const row of PEOPLE_RECORD.healthRows({ people: record, id })) {
			if (row.code === 0 || seen.has(row.code)) continue
			seen.add(row.code)
			const condition = row.code - 1
			if (age > OLD_AGE && condition === BLIND) everBlind++
			if (age > OLD_AGE && condition === INCAPABLE) {
				everIncapable++
				incapableYears += death - row.timeMs / yearMs
			}
			if (row.timeMs <= snapshot) continue
			onsets[condition]++
			onsetAges[condition] += row.timeMs / yearMs - birth
		}
	}
	return {
		deaths: count,
		byCause: Object.fromEntries(
			PEOPLE_LOG.deathCauses.map((cause, index) => [cause, causes[index]]),
		) as Record<DeathCause, number>,
		ageAtDeath: [quantiles({ ages: ages[0] }), quantiles({ ages: ages[1] })],
		adultAgeAtDeath: [
			quantiles({ ages: adultAges[0] }),
			quantiles({ ages: adultAges[1] }),
		],
		childhoodCohort: cohort,
		survivedTo16Share: cohort > 0 ? survived / cohort : null,
		reached50,
		everBlind,
		everIncapable,
		incapableYears: everIncapable > 0 ? incapableYears / everIncapable : null,
		onsetAges: byCondition(
			onsets.map(
				(count, index): OnsetReport => ({
					onsets: count,
					meanAge: count > 0 ? onsetAges[index] / count : null,
				}),
			),
		),
	}
}

function causes({ engine, tracker, from, to }: CauseWindowParams): CauseReport {
	const started: Record<RegencyCause, number> = { minority: 0, incapacity: 0 }
	const usurped: Record<RegencyCause, number> = { minority: 0, incapacity: 0 }
	const lo = from * STATE.yearMs
	const hi = to * STATE.yearMs
	for (const note of engine.events) {
		if (note.time < lo || note.time >= hi) continue
		const cause = note.data.regencyCause as RegencyCause
		if (note.tag === "regency started") started[cause]++
		else if (note.tag === "usurpation") usurped[cause]++
	}
	return {
		regenciesStarted: started,
		usurpations: usurped,
		weakCrownYears: { ...tracker.weakCrownYears },
	}
}

function command({ engine, from, to }: CauseWindowParams): CommandReport {
	const report: CommandReport = {
		fieldBattles: 0,
		ledSides: 0,
		leadersKilled: 0,
		maxLedPerRulerYear: 0,
	}
	const led = new Map<string, number>()
	const lo = from * STATE.yearMs
	const hi = to * STATE.yearMs
	for (const note of engine.events) {
		if (note.tag !== "battle" || note.time < lo || note.time >= hi) continue
		report.fieldBattles++
		const year = Math.floor(note.time / STATE.yearMs)
		for (const side of ["attacker", "defender"] as const) {
			const leader = note.data[`${side}Leader`] as number
			if (leader < 0) continue
			report.ledSides++
			if (note.data[`${side}LeaderKilled`]) report.leadersKilled++
			const count = (led.get(`${leader}:${year}`) ?? 0) + 1
			led.set(`${leader}:${year}`, count)
			report.maxLedPerRulerYear = Math.max(report.maxLedPerRulerYear, count)
		}
	}
	return report
}

// Closes the window [from, to) and opens the next at the engine's counters.
function summarize({
	engine,
	tracker,
	record,
	start,
	from,
	to,
}: SummarizeHealthParams): PeopleHealthReport {
	const years = Math.max(1, to - from)
	const now = engine.lifecycle
	const before = tracker.counters
	const group = (index: number): ConditionAgeGroup => ({
		personYears: tracker.groupYears[index],
		withCondition: byCondition(tracker.groupConditions[index]),
	})
	const report: PeopleHealthReport = {
		lifecycle: {
			weddingsPerYear: tracker.weddings / years,
			birthEventsPerYear: (now.births - before.births) / years,
			deathEventsPerYear: (now.deaths - before.deaths) / years,
			staleDeathEvents: now.staleDeaths - before.staleDeaths,
			cancelledDeliveries: now.cancelledDeliveries - before.cancelledDeliveries,
			peakPendingDeliveries: now.peakDeliveries,
			deadSeatHolderYears: tracker.deadSeatHolderYears,
		},
		deaths: deaths({ record, start, from, to }),
		bandPersonYears: byBand(tracker.bandYears),
		conditions: {
			from50To59: group(0),
			from60To69: group(1),
			from70: group(2),
			levelYears: Object.fromEntries(
				tracker.levelYears.map((levels, index) => [
					PEOPLE_LOG.conditions[index],
					levels,
				]),
			),
		},
		causes: causes({ engine, tracker, from, to }),
		command: command({ engine, tracker, from, to }),
		healthPassMsPerYear: tracker.healthMs / years,
	}
	now.peakDeliveries = engine.people.deliveries.byId.size
	Object.assign(tracker, createTracker({ engine }))
	return report
}

// The people alive when the simulation began: their starting bands, and how
// many died in its first year, its second, and its third to tenth.
function starters({ record, start }: StarterParams): StarterReport {
	const persons = record.persons
	const yearMs = STATE.yearMs
	const bands = PEOPLE_LOG.healthBands.map(() => 0)
	const group = (): StarterAgeGroup => ({
		starters: 0,
		diedYear1: 0,
		diedYear2: 0,
		diedYears3To10: 0,
	})
	const report = {
		under16: group(),
		from16To39: group(),
		from40To59: group(),
		from60: group(),
	}
	for (let id = 0; id < PEOPLE_RECORD.count(record); id++) {
		const birth = persons.birthTimeMs[id] / yearMs
		const death = persons.deathTimeMs[id] / yearMs
		if (
			birth > start ||
			death <= start ||
			persons.healthTimeMs[id] > start * yearMs
		)
			continue
		bands[persons.healthBand[id]]++
		const age = start - birth
		const entry =
			age < 16
				? report.under16
				: age < 40
					? report.from16To39
					: age < 60
						? report.from40To59
						: report.from60
		entry.starters++
		if (death <= start + 1) entry.diedYear1++
		else if (death <= start + 2) entry.diedYear2++
		else if (death <= start + 10) entry.diedYears3To10++
	}
	return { bands: byBand(bands), ...report }
}

export const PEOPLE_HEALTH_REPORT = {
	tracker: createTracker,
	ingest,
	sample,
	summarize,
	starters,
}
