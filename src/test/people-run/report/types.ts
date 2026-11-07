import type { HistoryState as RecordState } from "@/model/history/record/types"
import type { RulerFact } from "@/model/people/anchors/types"
import type { PeopleContext } from "@/model/people/cast/types"

export interface Quantiles {
	mean: number
	p10: number
	p50: number
	p90: number
}

export interface MsQuantiles {
	p50: number
	p95: number
}

export interface PeopleReport {
	rulers: number
	persons: number
	castSize: number
	marriages: number
	relabelShare: Record<string, number>
	placed: Record<string, number>
	unfilledTieShare: number
	ties: number
	childrenPerCompletedCouple: number
	completedCouples: number
	adultDeathAge: Quantiles
	firstMarriageAge: { female: number; male: number }
	conditionShareAt60: number
	incapableShare: number
	childbirthDeathShare: number
	frameMs: MsQuantiles
	warmMs: MsQuantiles
	pageMs: MsQuantiles
	ingestMs: { first: number }
	placementMs: number
	generationMs: number
	generatedPages: number
	castSpouseShare: number
	passedOverShare: number
	passedOverRows: number
	revealedLaterCount: number
	reservedUnfit: number
	unrecordedParentCount: number
	allianceRows: number
	nobility: NobilityReport
}

export interface NobilityReport {
	freeMarriages: number
	lowbornShare: number
	tierShare: Record<string, number>
	kinMarriageShare: number
}

export interface PeopleReportParams {
	sampleSize: number
	state: RecordState
	context: PeopleContext
}

export interface SampleParams {
	facts: RulerFact[]
	timeMs: number
	size: number
	seed: number
}

export interface QuantileParams {
	values: number[]
	share: number
}
