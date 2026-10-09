import { STATE } from "@/model/history/sim/engine/state"
import { MARRIAGE_DIAGNOSTICS } from "@/model/history/sim/people/family/diagnostics"
import type {
	SearchTotals,
	SelectionTotals,
} from "@/model/history/sim/people/family/diagnostics/types"
import { HOLDINGS } from "@/model/history/sim/people/holdings"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { KINSHIP } from "@/model/history/sim/people/kinship"
import type {
	MarriageDemographyParams,
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

function demography({ engine, record, from, to }: MarriageDemographyParams) {
	const people = engine.people,
		table = people.persons
	const cache = new Map<number, Map<number, number>>()
	const weddingsByRelation: Record<string, number> = {},
		weddingsByBar: Record<string, number> = {}
	const born = [0, 0, 0, 0],
		weddings = [0, 0, 0, 0],
		adultYears = [0, 0, 0, 0]
	let childlessCouples = 0,
		couples = 0,
		birthsToConsorts = 0
	for (let person = 0; person < table.sex.length; person++) {
		const orientation = table.orientation[person]
		if (table.birth[person] >= from && table.birth[person] < to) {
			born[orientation]++
			const mother = table.mother[person],
				father = table.father[person]
			if (
				mother >= 0 &&
				father >= 0 &&
				(record.consortsOf.get(mother) ?? []).some((index) => {
					const tie = record.consorts[index]
					return (
						tie.patron === father &&
						tie.startTimeMs / STATE.yearMs <= table.birth[person]
					)
				})
			)
				birthsToConsorts++
		}
		adultYears[orientation] += Math.max(
			0,
			Math.min(to, table.death[person]) -
				Math.max(
					from,
					table.birth[person] + (table.sex[person] === 0 ? 18 : 16),
					table.createdAt[person],
				),
		)
	}
	for (const tie of record.marriages) {
		const time = tie.startTimeMs / STATE.yearMs
		if (time < from || time >= to) continue
		const relation = KINSHIP.relation({
			context: table,
			a: tie.husband,
			b: tie.wife,
			cache,
		})
		weddingsByRelation[relation.kind] =
			(weddingsByRelation[relation.kind] ?? 0) + 1
		for (const person of [tie.husband, tie.wife]) {
			weddings[table.orientation[person]]++
			const realm = people.household.realmOf(
				HOUSEHOLD.residenceAt({ people, person, time }),
			)
			const bar = people.household.lawOfRealm(realm).bar
			weddingsByBar[bar] = (weddingsByBar[bar] ?? 0) + 1
		}
		couples++
		if (
			!table.children[tie.wife].some(
				(child) =>
					table.father[child] === tie.husband &&
					table.birth[child] >= time &&
					table.birth[child] < to,
			)
		)
			childlessCouples++
	}
	const tiesByKind = { wife: 0, concubine: 0 }
	for (const tie of record.consorts)
		if (
			tie.startTimeMs / STATE.yearMs >= from &&
			tie.startTimeMs / STATE.yearMs < to
		)
			tiesByKind[tie.consortKind]++
	let eligibleMen = 0,
		livingConsorts = 0
	for (const person of people.alive) {
		if (
			table.sex[person] !== 0 ||
			table.birth[person] > to - 18 ||
			table.birth[person] <= to - 70 ||
			table.death[person] <= to
		)
			continue
		const law = people.household.lawOfRealm(
			HOUSEHOLD.realmOf({ people, person }),
		)
		if (
			law.consort === "none" ||
			HOLDINGS.standing({ people, person, ranks: engine.seatRank }) < 2
		)
			continue
		eligibleMen++
		livingConsorts += table.consorts[person].filter(
			(partner) => table.death[partner] > to,
		).length
	}
	return {
		orientationBorn: born,
		orientationShares: born.map((count) =>
			rate({ numerator: count, denominator: born.reduce((a, b) => a + b, 0) }),
		),
		weddingsByRelation,
		weddingsByBar,
		weddingRateByOrientation: weddings.map((count, orientation) => ({
			weddings: count,
			adultYears: adultYears[orientation],
			perAdultYear: rate({
				numerator: count,
				denominator: adultYears[orientation],
			}),
		})),
		childlessCouples,
		couples,
		tiesByKind,
		eligibleMen,
		livingConsorts,
		meanLivingConsorts: rate({
			numerator: livingConsorts,
			denominator: eligibleMen,
		}),
		birthsToConsorts,
	}
}
export const PEOPLE_MARRIAGE_REPORT = {
	demography,
	summarize: summarize,
}
