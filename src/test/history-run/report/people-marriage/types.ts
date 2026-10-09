import type { PeopleRecord } from "@/model/history/record/people/types"

import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type {
	MarriageTotals,
	SearchTotals,
	SelectionTotals,
} from "@/model/history/sim/people/family/diagnostics/types"
export interface MarriageDemographyParams {
	engine: HistoryState
	record: PeopleRecord
	from: number
	to: number
}
export interface MarriageWindowParams {
	windows: Map<number, MarriageTotals>
	from: number
	to: number
}

export interface SearchReport extends SearchTotals {
	rejected: number
	comparisonDenominator: number
	rejectionRate: number | null
	severalShare: number | null
	differenceShare: number | null
	rankingShare: number | null
	rejectionOnlyShare: number | null
}

export interface SelectionReport extends SelectionTotals {
	meanDirected: SelectionTotals["components"] | null
	meanOpinion: SelectionTotals["opinionComponents"] | null
	meanPairSum: number | null
	meanAgeGap: number | null
	sameCultureShare: number | null
	sharedHeritageShare: number | null
	sharedReligionShare: number | null
}

export interface MarriageMarketReport extends MarriageTotals {
	searches: { domestic: SearchReport; foreign: SearchReport }
	selections: {
		domestic: SelectionReport
		foreign: SelectionReport
		betrothal: SelectionReport
		outsider: SelectionReport
	}
	fallbackAcceptance: Record<keyof MarriageTotals["fallback"], number | null>
}

export interface RateParams {
	numerator: number
	denominator: number
}
