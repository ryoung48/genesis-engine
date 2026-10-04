import { MARRIAGE_DIAGNOSTICS } from "@/model/history/sim/people/family/diagnostics"
import type {
	SearchTotals,
	SelectionTotals,
} from "@/model/history/sim/people/family/diagnostics/types"
import type {
	MarriageMarketReport,
	MarriageWindowParams,
	RateParams,
	SearchReport,
	SelectionReport,
} from "@/test/history-run/report/people-marriage/types"

function rate({ numerator, denominator }: RateParams): number | null {
	return denominator > 0 ? numerator / denominator : null
}

function search(row: SearchTotals): SearchReport {
	const rejected = row.observerOnly + row.candidateOnly + row.bothNegative
	const comparisonDenominator = row.ranking + row.rejection + row.unchanged
	return {
		...row,
		rejected,
		comparisonDenominator,
		rejectionRate: rate({ numerator: rejected, denominator: row.evaluated }),
		severalShare: rate({ numerator: row.several, denominator: row.searches }),
		differenceShare: rate({
			numerator: row.ranking + row.rejection,
			denominator: comparisonDenominator,
		}),
		rankingShare: rate({
			numerator: row.ranking,
			denominator: comparisonDenominator,
		}),
		rejectionOnlyShare: rate({
			numerator: row.rejection,
			denominator: comparisonDenominator,
		}),
	}
}

function selection(row: SelectionTotals): SelectionReport {
	return {
		...row,
		meanDirected:
			row.selected > 0
				? (Object.fromEntries(
						Object.entries(row.components).map(([key, value]) => [
							key,
							value / (2 * row.selected),
						]),
					) as SelectionTotals["components"])
				: null,
		meanOpinion:
			row.selected > 0
				? (Object.fromEntries(
						Object.entries(row.opinionComponents).map(([key, value]) => [
							key,
							value / (2 * row.selected),
						]),
					) as SelectionTotals["opinionComponents"])
				: null,
		meanPairSum: rate({
			numerator: row.components.total,
			denominator: row.selected,
		}),
		meanAgeGap: rate({ numerator: row.ageGap, denominator: row.selected }),
		sameCultureShare: rate({
			numerator: row.culture.same,
			denominator: row.culture.known,
		}),
		sharedHeritageShare: rate({
			numerator: row.heritage.same,
			denominator: row.heritage.known,
		}),
		sharedReligionShare: rate({
			numerator: row.religion.same,
			denominator: row.religion.known,
		}),
	}
}

function summarize({
	windows,
	from,
	to,
}: MarriageWindowParams): MarriageMarketReport {
	const totals = MARRIAGE_DIAGNOSTICS.create()
	for (const [time, source] of windows)
		if (time >= from && time < to)
			MARRIAGE_DIAGNOSTICS.merge({ target: totals, source })
	return {
		...totals,
		searches: {
			domestic: search(totals.searches.domestic),
			foreign: search(totals.searches.foreign),
		},
		selections: {
			domestic: selection(totals.selections.domestic),
			foreign: selection(totals.selections.foreign),
			betrothal: selection(totals.selections.betrothal),
			outsider: selection(totals.selections.outsider),
		},
		fallbackAcceptance: {
			through25: rate({
				numerator: totals.fallback.through25.accepted,
				denominator: totals.fallback.through25.attempts,
			}),
			"26to29": rate({
				numerator: totals.fallback["26to29"].accepted,
				denominator: totals.fallback["26to29"].attempts,
			}),
			"30to34": rate({
				numerator: totals.fallback["30to34"].accepted,
				denominator: totals.fallback["30to34"].attempts,
			}),
			"35plus": rate({
				numerator: totals.fallback["35plus"].accepted,
				denominator: totals.fallback["35plus"].attempts,
			}),
		},
	}
}

export const PEOPLE_MARRIAGE_REPORT = { summarize: summarize }
