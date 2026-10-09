import type { PeopleRecord } from "@/model/history/record/people/types"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import type {
	HistoryState,
	LifecycleCounters,
} from "@/model/history/sim/engine/state/types"
import type { HealthCondition } from "@/model/history/sim/people/health/ageing/types"
import type { HealthBand } from "@/model/history/sim/people/health/types"
import type { DeathCause, RegencyCause } from "@/model/history/sim/people/types"

export interface LifecycleReport {
	// Weddings completed in yearly passes.
	weddingsPerYear: number
	birthEventsPerYear: number
	deathEventsPerYear: number
	staleDeathEvents: number
	cancelledDeliveries: number
	peakPendingDeliveries: number
	// Yearly samples of a seat whose holder is dead; a death always passes its
	// seats on, so this stays 0.
	deadSeatHolderYears: number
}

// Ages at death in years at the 5th, 25th, 50th, 75th and 95th percentiles;
// null without a death.
export type AgeQuantiles = [number, number, number, number, number] | null

export interface OnsetReport {
	// People who died in the window having developed the condition in the
	// simulation.
	onsets: number
	// Null without an onset.
	meanAge: number | null
}

export interface DeathReport {
	deaths: number
	byCause: Record<DeathCause, number>
	// All deaths, by sex (men, women).
	ageAtDeath: [AgeQuantiles, AgeQuantiles]
	// Deaths at 16 or older, by sex.
	adultAgeAtDeath: [AgeQuantiles, AgeQuantiles]
	// Children delivered in the simulation whose 16th birthday, reached or
	// not, fell in the window.
	childhoodCohort: number
	// Null for an empty cohort.
	survivedTo16Share: number | null
	// The dead of the window who had lived past 50 with a health record.
	reached50: number
	everBlind: number
	everIncapable: number
	// Mean years lived Incapable; null when nobody was.
	incapableYears: number | null
	onsetAges: Record<HealthCondition, OnsetReport>
}

// Yearly samples of the living in one age group: how many, and how many had
// each condition.
export interface ConditionAgeGroup {
	personYears: number
	withCondition: Record<HealthCondition, number>
}

export interface ConditionReport {
	from50To59: ConditionAgeGroup
	from60To69: ConditionAgeGroup
	from70: ConditionAgeGroup
	// Sampled person-years at each level 0-4 of the five ageing conditions.
	levelYears: Record<string, number[]>
}

export interface CauseReport {
	regenciesStarted: Record<RegencyCause, number>
	usurpations: Record<RegencyCause, number>
	// Yearly samples of sovereign realms with a weak crown, by its cause; a
	// regency takes precedence, then ailing health.
	weakCrownYears: {
		minority: number
		incapacity: number
		ailing: number
	}
}

export interface CommandReport {
	fieldBattles: number
	// Sides of those battles led by their ruler in person.
	ledSides: number
	leadersKilled: number
	// The most battles any one ruler led in a calendar year.
	maxLedPerRulerYear: number
}

export interface PeopleHealthReport {
	lifecycle: LifecycleReport
	deaths: DeathReport
	// Yearly samples of the living, by recorded health band.
	bandPersonYears: Record<HealthBand, number>
	conditions: ConditionReport
	causes: CauseReport
	command: CommandReport
	healthPassMsPerYear: number
}

// Deaths of the people alive at the start, by their age then.
export interface StarterAgeGroup {
	starters: number
	diedYear1: number
	diedYear2: number
	diedYears3To10: number
}

export interface StarterReport {
	bands: Record<HealthBand, number>
	under16: StarterAgeGroup
	from16To39: StarterAgeGroup
	from40To59: StarterAgeGroup
	from60: StarterAgeGroup
}

export interface PeopleHealthTracker {
	// Engine counters at the start of the open window.
	counters: LifecycleCounters
	weddings: number
	bandYears: number[]
	healthMs: number
	// Sampled person-years of the three age groups, then per group and
	// condition.
	groupYears: number[]
	groupConditions: number[][]
	levelYears: number[][]
	weakCrownYears: CauseReport["weakCrownYears"]
	deadSeatHolderYears: number
}

export interface TrackerParams {
	engine: HistoryState
}

export interface IngestHealthParams {
	tracker: PeopleHealthTracker
	transactions: JournalTransaction[]
}

export interface SampleHealthParams {
	engine: HistoryState
	tracker: PeopleHealthTracker
}

export interface SummarizeHealthParams {
	engine: HistoryState
	tracker: PeopleHealthTracker
	// The record of every transaction through the window's end.
	record: PeopleRecord
	// The simulation's first year.
	start: number
	from: number
	to: number
}

export interface DeathWindowParams {
	record: PeopleRecord
	start: number
	from: number
	to: number
}

export interface CauseWindowParams {
	engine: HistoryState
	tracker: PeopleHealthTracker
	from: number
	to: number
}

export interface StarterParams {
	record: PeopleRecord
	start: number
}

export interface QuantilesParams {
	ages: number[]
}
