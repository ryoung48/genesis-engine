import { expect, it } from "vitest"
import { MARRIAGE_DIAGNOSTICS } from "@/model/history/sim/people/family/diagnostics"
import type {
	SearchKind,
	SearchObservation,
	SelectionKind,
} from "@/model/history/sim/people/family/diagnostics/types"
import type { MatchScore } from "@/model/history/sim/people/family/match-scoring/types"
import type { OpinionPerson } from "@/model/history/sim/people/opinion/types"
import { MARRIAGE_FIXTURE } from "@/test/history-run/fixtures/marriage"
import { PEOPLE_MARRIAGE_REPORT } from "@/test/history-run/report/people-marriage"

function score(vector: number[]): MatchScore {
	const [attraction, opinion, age, standing, alliance, desperation] = vector
	return {
		attraction,
		opinion,
		age,
		standing,
		alliance,
		desperation,
		total: vector.reduce((sum, value) => sum + value, 0),
		breakdown: {
			personality: opinion,
			culture: 0,
			religion: 0,
			reputation: 0,
			kin: 0,
			spouse: 0,
			memories: 0,
			unclamped: opinion,
			total: opinion,
		},
	}
}

it("matches every hand-counted search denominator, first-fit category and directed mean", () => {
	for (const group of ["domestic", "foreign"] as SearchKind[]) {
		const totals = MARRIAGE_DIAGNOSTICS.create()
		const counts = [3, 2, 1, 0, 2, 1]
		const kinds: SearchObservation["firstFit"][] = [
			"ranking",
			"rejection",
			"rejection",
			"empty",
			"unchanged",
			"unchanged",
		]
		for (let index = 0; index < 6; index++)
			MARRIAGE_DIAGNOSTICS.observe({
				totals,
				observation: {
					kind: "search",
					time: 100,
					group,
					visited: counts[index] + Number(index === 0 || index === 4),
					hardEligible: counts[index] + Number(index === 0 || index === 4),
					kinship: Number(index === 0 || index === 4),
					evaluated: counts[index],
					observerOnly: Number(index === 0),
					candidateOnly: Number(index === 1),
					bothNegative: Number(index === 2),
					firstFit: kinds[index],
					scoringMs: 1,
				},
			})
		const fixture = MARRIAGE_FIXTURE.create()
		for (const sex of [0, 1] as const)
			MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
		for (const vector of [
			[10, 5, -10, 10, 0, 5],
			[0, 10, 0, 0, 0, 20],
			[5, 0, -10, 20, 25, 0],
			[0, 0, 0, 0, 0, 10],
		])
			MARRIAGE_DIAGNOSTICS.observe({
				totals,
				observation: {
					kind: "selection",
					time: 100,
					group,
					first: score(vector),
					second: score(vector),
					a: fixture.context.personOf(0) as OpinionPerson,
					b: fixture.context.personOf(1) as OpinionPerson,
					current: [0, 0],
					projected: [0, 0],
					tiers: [],
				},
			})
		const report = PEOPLE_MARRIAGE_REPORT.summarize({
			windows: new Map([[100, totals]]),
			from: 100,
			to: 101,
		})
		expect(report.searches[group]).toMatchObject({
			searches: 6,
			hardEligible: 11,
			kinship: 2,
			evaluated: 9,
			rejected: 3,
			observerOnly: 1,
			candidateOnly: 1,
			bothNegative: 1,
			rejectionRate: 3 / 9,
			severalShare: 3 / 6,
			comparisonDenominator: 5,
			differenceShare: 3 / 5,
			rankingShare: 1 / 5,
			rejectionOnlyShare: 2 / 5,
			unchanged: 2,
		})
		expect(report.selections[group]).toMatchObject({
			selected: 4,
			meanDirected: {
				attraction: 3.75,
				opinion: 3.75,
				age: -5,
				standing: 7.5,
				alliance: 6.25,
				desperation: 8.75,
				total: 25,
			},
			meanPairSum: 50,
		})
		const empty = PEOPLE_MARRIAGE_REPORT.summarize({
			windows: new Map(),
			from: 100,
			to: 101,
		})
		expect(empty.searches[group]).toMatchObject({
			rejectionRate: null,
			severalShare: null,
			differenceShare: null,
		})
		expect(empty.selections[group].meanDirected).toBeNull()
	}
})

it("uses known-ID composition denominators and current ruler tiers and retains captured inputs", () => {
	for (const group of ["domestic", "foreign", "betrothal"] as SelectionKind[]) {
		const totals = MARRIAGE_DIAGNOSTICS.create()
		const fixture = MARRIAGE_FIXTURE.create()
		for (const sex of [0, 1] as const)
			MARRIAGE_FIXTURE.add({ fixture, age: 30, sex, realm: 0 })
		const a = fixture.context.personOf(0) as OpinionPerson
		const b = fixture.context.personOf(1) as OpinionPerson
		for (const [index, ids] of [
			[0, 0, 0, 0, 0, 0],
			[0, 1, 0, 0, 0, 1],
			[-1, -1, -1, -1, 0, 0],
			[0, 1, 0, 1, -1, -1],
		].entries()) {
			;[a.culture, b.culture, a.heritage, b.heritage, a.religion, b.religion] =
				ids
			MARRIAGE_DIAGNOSTICS.observe({
				totals,
				observation: {
					kind: "selection",
					time: 100,
					group,
					first: score([0, 0, 0, 0, 0, 0]),
					second: score([0, 0, 0, 0, 0, 0]),
					a,
					b,
					current: [0, 0],
					projected: index === 3 ? [5, 0] : [0, 0],
					tiers: index < 3 ? [[0], [2], [3]][index] : [],
				},
			})
		}
		a.culture = 999
		b.heritage = 999
		a.religion = 999
		const report = PEOPLE_MARRIAGE_REPORT.summarize({
			windows: new Map([[100, totals]]),
			from: 100,
			to: 101,
		}).selections[group]
		expect(report).toMatchObject({
			sameCultureShare: 1 / 3,
			sharedHeritageShare: 2 / 3,
			sharedReligionShare: 2 / 3,
			rulersByTier: [1, 0, 1, 1, 0],
		})
	}
})

it("counts fallback opportunities separately from instantiated proposals and uses half-open windows", () => {
	const totals = MARRIAGE_DIAGNOSTICS.create()
	MARRIAGE_DIAGNOSTICS.observe({
		totals,
		observation: {
			kind: "fallback",
			time: 100,
			age: 25,
			attempt: false,
			accepted: false,
		},
	})
	for (const [attempt, accepted] of [
		[true, true],
		[true, false],
		[false, false],
		[false, false],
	])
		MARRIAGE_DIAGNOSTICS.observe({
			totals,
			observation: { kind: "fallback", time: 100, age: 30, attempt, accepted },
		})
	for (const attempt of [true, false])
		MARRIAGE_DIAGNOSTICS.observe({
			totals,
			observation: {
				kind: "fallback",
				time: 100,
				age: 35,
				attempt,
				accepted: attempt,
			},
		})
	MARRIAGE_DIAGNOSTICS.observe({
		totals,
		observation: { kind: "projection", time: 100, ms: 5 },
	})
	MARRIAGE_DIAGNOSTICS.observe({
		totals,
		observation: { kind: "kinship release", time: 100 },
	})
	const windows = new Map([[100, totals]])
	expect(
		PEOPLE_MARRIAGE_REPORT.summarize({ windows, from: 99, to: 100 })
			.kinshipReleases,
	).toBe(0)
	const report = PEOPLE_MARRIAGE_REPORT.summarize({
		windows,
		from: 100,
		to: 101,
	})
	expect(report).toMatchObject({
		projectionRefreshes: 1,
		projectionMs: 5,
		kinshipReleases: 1,
		fallbackAcceptance: { through25: null, "30to34": 0.5, "35plus": 1 },
		fallback: {
			through25: { opportunities: 1, attempts: 0, accepted: 0 },
			"30to34": { opportunities: 4, attempts: 2, accepted: 1 },
			"35plus": { opportunities: 2, attempts: 1, accepted: 1 },
		},
	})
})
