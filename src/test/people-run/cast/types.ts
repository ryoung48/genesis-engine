import type { Cast, Person } from "@/model/people/cast/types"
import type { PersonPage } from "@/model/people/query/types"
import type { PeopleFixture } from "@/test/history-run/fixtures/people/types"

export interface MarriageShot {
	shownUntil: number
	startMs: number
	kind: string
	children: Array<[number, number]>
	pregnancies: Array<[number, number, string]>
}

export interface Scenario {
	fixture: PeopleFixture
	cast: Cast
	firstTimeMs: number
	secondTimeMs: number
	changed: string[]
	structural: number
	lifeDrift: number
	spouseViolations: number
	spouseSearches: number
	ingestMs: number[]
	pageMs: number[]
}

export interface PickParams {
	cast: Cast
	count: number
	skip: Set<number>
}

export interface CompareMarriagesParams {
	before: Map<number, MarriageShot>
	cast: Cast
}

export interface CompareShownParams {
	before: PersonPage
	after: PersonPage
}

export interface QualifiesParams {
	cast: Cast
	owner: Person
	other: Person
	startMs: number
	fromMs: number
	tier: number
	realms: Set<number>
}

export interface PassedOverCountParams {
	cast: Cast
	timeMs: number
}

export interface PassedOverCount {
	expected: number
	rows: number
}

export interface FiguresParams {
	scenario: Scenario
}

export interface GrownFigures {
	points: number
	pages: number
	changed: number
	structural: number
	lifeDrift: number
	castSize: number
	castSpouseShare: number
	relabelShare: Record<string, number>
	placed: Record<string, number>
	unfilledTieShare: number
	ties: number
	passedOverShare: number
	revealedLaterCount: number
	reservedUnfit: number
	unrecordedParentCount: number
	deathContradictions: number
	ingestMs: { p50: number; p95: number; max: number }
	pageMs: { p50: number; p95: number }
}
