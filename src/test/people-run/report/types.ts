import type { HistoryState as RecordState } from "@/model/history/record/types"
import type { RulerFact } from "@/model/people/anchors/types"
import type { ReligionDoctrine } from "@/model/people/doctrine/types"
import type { PeopleGeography } from "@/model/people/store/types"

export interface Quantiles {
	mean: number
	p10: number
	p50: number
	p90: number
}

export interface PeopleReport {
	rulers: number
	persons: number
	relabelShare: Record<string, number>
	placed: Record<string, number>
	unfilledTieShare: number
	ties: number
	indexMs: number
	childrenPerCompletedCouple: number
	completedCouples: number
	adultDeathAge: Quantiles
	firstMarriageAge: { female: number; male: number }
	conditionShareAt60: number
	incapableShare: number
	childbirthDeathShare: number
	layerBuilds: { l1: number; l2: number; l3: number }
	frameMs: { p50: number; p95: number }
	warmMs: { p50: number; p95: number }
	pageMs: { p50: number; p95: number }
	generationMs: number
	nobility: NobilityReport
	generatedPages: number
}

export interface NobilityReport {
	freeMarriages: number
	claimedShare: number
	lowbornShare: number
	tierShare: Record<string, number>
	seededRealms: number
	holdersCreated: number
	kinMarriageShare: number
}

export interface PeopleReportParams {
	sampleSize: number
	state: RecordState
	doctrine: ReligionDoctrine | null
	geography: PeopleGeography | null
}

export interface SampleParams {
	facts: RulerFact[]
	timeMs: number
	size: number
	seed: number
}

export interface MsQuantiles {
	p50: number
	p95: number
}

export interface QuantileParams {
	values: number[]
	share: number
}
