import { expect, it, vi } from "vitest"
import { HISTORY } from "@/model/history/record"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { TRUCE } from "@/model/history/sim/engine/events/peace/truce"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { CORONATION } from "@/model/history/sim/engine/events/succession/coronation"
import { CORONATION_COUNTERS } from "@/model/history/sim/engine/events/succession/coronation/counters"
import type {
	CoronationCounters,
	CoronationKind,
	CoronationQuality,
} from "@/model/history/sim/engine/events/succession/coronation/counters/types"
import { OVERTHROW } from "@/model/history/sim/engine/events/succession/overthrow"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { WAR } from "@/model/history/sim/engine/events/war"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { MILITARY } from "@/model/history/sim/engine/military"
import { LIVE_OPINION_CONTEXT } from "@/model/history/sim/engine/opinion-context"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { FAMILY } from "@/model/history/sim/people/family"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { OPINION } from "@/model/history/sim/people/opinion"
import { SIM_RECORD } from "@/model/history/sim/record"
import { DEJURE } from "@/model/society/dejure"
import { FOUNDING } from "@/model/society/dejure/founding"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { DISTRICT_FIXTURE } from "@/test/history-run/fixtures/district-tiers"
import type { DistrictTitle } from "@/test/history-run/fixtures/district-tiers/types"
import { MARRIAGE_FIXTURE } from "@/test/history-run/fixtures/marriage"
import { PEOPLE_OPINION_REPORT } from "@/test/history-run/report/people-opinion"
import { TITLE_TIMELINE } from "@/ui/genesis/wiki-bridge/title-timeline"

const FEES = [625 / 288, 625 / 144, 625 / 36, 3125 / 36, 3125 / 8]
const MULTIPLIERS: Record<CoronationQuality, number> = {
	uncrowned: 0,
	humble: 0.5,
	customary: 1,
	lavish: 2,
	magnificent: 4,
}
const TWO_DUCHIES: DistrictTitle[] = [
	{ tier: 1, seat: 1, provinces: [0, 1, 2, 3] },
	{ tier: 1, seat: 5, provinces: [4, 5, 6, 7] },
]
const SMALL_DUCHIES: DistrictTitle[] = [
	{ tier: 1, seat: 1, provinces: [0, 1] },
	{ tier: 1, seat: 3, provinces: [2, 3] },
]
const KINGDOM: DistrictTitle[] = [{ tier: 2, seat: 0, provinces: [0, 1] }]

interface RealmSpec {
	root: number
	titles: DistrictTitle[]
}

interface WorldSpec {
	realms: RealmSpec[]
	// Titles spanning several realms; they start vacant.
	shared: DistrictTitle[]
}

function range(from: number, to: number): number[] {
	return Array.from({ length: to - from }, (_, i) => from + i)
}

function world({ realms, shared }: WorldSpec) {
	const owned = realms.map((spec) =>
		spec.titles.flatMap((title) => title.provinces),
	)
	const count = Math.max(2, ...owned.flat().map((p) => p + 1))
	const fixture = DISTRICT_FIXTURE.create({
		count,
		root: realms[0].root,
		edges: range(0, count - 1).map((i) => [i, i + 1] as [number, number]),
		titles: [],
	})
	const { state, rng } = fixture
	const rootOf = new Map<number, number>()
	for (const [index, spec] of realms.entries())
		for (const p of owned[index]) rootOf.set(p, spec.root)
	for (const p of fixture.members) {
		const root = rootOf.get(p) ?? realms[0].root
		state.parentCurrent[p] = p === root ? -1 : root
	}
	state.hierarchyDirty = true
	const titles = [
		...realms.flatMap((spec) =>
			spec.titles.map((title) => ({ ...title, holder: spec.root })),
		),
		...shared.map((title) => ({ ...title, holder: -1 })),
	]
	state.titles = {
		count: titles.length,
		tier: new Uint8Array(state.P),
		seat: new Int32Array(state.P).fill(-1),
		holder: new Int32Array(state.P).fill(-1),
		regionOf: new Int32Array(4 * state.P).fill(-1),
	}
	for (const [id, title] of titles.entries()) {
		state.titles.tier[id] = title.tier
		state.titles.seat[id] = title.seat
		state.titles.holder[id] = title.holder
		for (const p of title.provinces)
			state.titles.regionOf[(title.tier - 1) * state.P + p] = id
	}
	state.titleMembers = DEJURE.membersOf({
		titles: state.titles,
		provinceCount: state.P,
	})
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
	})
	const rulers = realms.map((spec) => {
		const members = fixture.members.filter(
			(p) => (rootOf.get(p) ?? realms[0].root) === spec.root,
		)
		STATE_TITLES.applyDerivedParents({ state, nation: spec.root, members })
		const ruler = DISTRICT_FIXTURE.person({ fixture, seat: -1, father: -1 })
		STATE.installRuler({
			state,
			p: spec.root,
			person: ruler,
			claim: 3,
			reason: "succession",
		})
		return ruler
	})
	state.realmCache.clear()
	state.treasuryBudgetCurrent.clear()
	state.events.length = 0
	const roll = vi.spyOn(rng, "random").mockReturnValue(0)
	const elevate = () => CORONATION.elevate({ state, rng })
	return { fixture, state, rng, roll, rulers, elevate }
}

function realm(titles: DistrictTitle[]) {
	const made = world({ realms: [{ root: 0, titles }], shared: [] })
	const { state } = made
	const pay = (value: number) =>
		FIELDS.prov.treasury.set({ state, p: 0, value })
	const hold = () => CORONATION.hold({ state, realm: 0, rng: made.rng })
	// Cash that resolves to the quality at the rank, whatever the reserve.
	const afford = (rank: number, quality: CoronationQuality) =>
		pay(
			MULTIPLIERS[quality] * FEES[rank] +
				(MULTIPLIERS[quality] > 1 ? ECONOMY.treasurySafe({ state, p: 0 }) : 0),
		)
	return { ...made, ruler: made.rulers[0], pay, hold, afford }
}

function cellOf(
	counters: CoronationCounters,
	kind: CoronationKind,
): (
	key: "held" | "ducats" | "memories" | "founded" | "raised",
	rank: number,
	quality: CoronationQuality,
) => number {
	return (key, rank, quality) =>
		counters[key][CORONATION_COUNTERS.cell({ kind, rank, quality })]
}

function total(values: Float64Array): number {
	return values.reduce((sum, value) => sum + value, 0)
}

function created(state: HistoryState): number {
	return state.events.filter((note) => note.tag === "title created").length
}

function child(state: HistoryState, person: number): void {
	state.people.persons.birth[person] = state.time / STATE.yearMs - 10
}

function expectIdentities(counters: CoronationCounters): void {
	for (const kind of CORONATION_COUNTERS.kinds) {
		let held = 0
		let founded = 0
		for (let rank = 0; rank < CORONATION_COUNTERS.ranks; rank++)
			for (const quality of CORONATION_COUNTERS.qualities) {
				const cell = CORONATION_COUNTERS.cell({ kind, rank, quality })
				expect(counters.ducats[cell]).toBeCloseTo(
					counters.held[cell] * MULTIPLIERS[quality] * FEES[rank],
					9,
				)
				if (quality === "customary") expect(counters.memories[cell]).toBe(0)
				expect(counters.raised[cell]).toBeLessThanOrEqual(
					counters.founded[cell],
				)
				expect(counters.raised[cell]).toBe(
					kind === "accession" ? 0 : counters.founded[cell],
				)
				held += counters.held[cell]
				founded += counters.founded[cell]
			}
		expect(founded).toBeLessThanOrEqual(held)
	}
	expect(counters.majority).toBeLessThanOrEqual(counters.deferred)
}

it.each([
	0, 1, 2, 3, 4,
])("debits the reference fee once for a customary coronation at top tier %i", (tier) => {
	const { state, pay, hold } = realm(
		tier === 0 ? [] : [{ tier, seat: 0, provinces: [0, 1] }],
	)
	expect(STATE_TITLES.topTier({ state, realm: 0 })).toBe(tier)
	pay(FEES[tier])
	hold()
	expect(state.treasuryCurrent[0]).toBe(0)
	expect(TREASURY_BUDGET.get({ state, p: 0 })).toMatchObject({
		coronationExpenses: -FEES[tier],
		otherChangesTotal: -FEES[tier],
		annualBalance: 0,
	})
	const cell = cellOf(state.coronations, "accession")
	expect(cell("held", tier, "customary")).toBe(1)
	expect(cell("ducats", tier, "customary")).toBe(FEES[tier])
	expect(total(state.coronations.held)).toBe(1)
	expectIdentities(state.coronations)
})

it.each<[number, number, CoronationQuality]>([
	[47, 7, "magnificent"],
	[47 - 1e-9, 7, "lavish"],
	[27, 7, "lavish"],
	[27 - 1e-9, 7, "customary"],
	[10, 7, "customary"],
	[10 - 1e-9, 7, "humble"],
	[5, 7, "humble"],
	[5 - 1e-9, 7, "uncrowned"],
	[-1, 7, "uncrowned"],
	[40, 0, "magnificent"],
])("resolves cash %s with reserve %s to %s at a reference fee of 10", (treasury, safe, quality) => {
	expect(CORONATION.quality({ reference: 10, treasury, safe })).toBe(quality)
})

it("elevates a sitting ruler at a coronation that is at least customary at the founded rank and charges once", () => {
	const { fixture, state, ruler, pay, elevate, roll } = realm(TWO_DUCHIES)
	const holders = [2, 6].map((seat) =>
		DISTRICT_FIXTURE.person({ fixture, seat, father: -1 }),
	)
	const leader = state.leaderRuntime.idx[0]
	roll.mockClear()
	pay(FEES[2])
	elevate()
	expect(created(state)).toBe(1)
	expect(state.titles.tier[2]).toBe(2)
	expect(state.people.rulerOf[0]).toBe(ruler)
	expect(state.leaderRuntime.idx[0]).toBe(leader)
	expect(state.treasuryCurrent[0]).toBe(0)
	expect(TREASURY_BUDGET.get({ state, p: 0 })).toMatchObject({
		coronationExpenses: -FEES[2],
		otherChangesTotal: -FEES[2],
	})
	const cell = cellOf(state.coronations, "elevation")
	expect(cell("held", 2, "customary")).toBe(1)
	expect(cell("founded", 2, "customary")).toBe(1)
	expect(cell("raised", 2, "customary")).toBe(1)
	expect(total(state.coronations.held)).toBe(1)
	expect(roll).toHaveBeenCalledTimes(1)
	for (const holder of holders)
		expect(state.people.memories.has(holder)).toBe(false)
	expect(state.compositeRealm[0]).toBe(0)
	STATE.validateLiveHierarchy({ state, context: "elevation coronation" })
	expectIdentities(state.coronations)

	const poor = realm(TWO_DUCHIES)
	poor.pay(FEES[2] - 1e-9)
	poor.elevate()
	expect(poor.roll).not.toHaveBeenCalled()
	expect(created(poor.state)).toBe(0)
	expect(poor.state.treasuryCurrent[0]).toBe(FEES[2] - 1e-9)
	expect(total(poor.state.coronations.held)).toBe(0)
	expect(poor.state.compositeRealm[0]).toBe(1)
})

it("never founds above the realm's rank at an accession coronation", () => {
	const { state, pay, hold, roll } = realm(TWO_DUCHIES)
	pay(1000)
	hold()
	expect(roll).not.toHaveBeenCalled()
	expect(created(state)).toBe(0)
	expect(total(state.coronations.held)).toBe(1)
	expect(total(state.coronations.founded)).toBe(0)
	expectIdentities(state.coronations)
})

it("founds one title at or below the realm's rank at an accession coronation, at no extra charge", () => {
	for (const top of [2, 3]) {
		const { fixture, state, ruler, pay, afford, hold, elevate, roll } = realm([
			{ tier: top, seat: 0, provinces: [0] },
			{ tier: 1, seat: 1, provinces: [1, 2, 3, 4] },
			{ tier: 1, seat: 5, provinces: [5, 6, 7, 8] },
			{ tier: top - 1, seat: 9, provinces: [9, 10] },
		])
		expect(STATE_TITLES.topTier({ state, realm: 0 })).toBe(top)
		expect(STATE_TITLES.isDistrictSeat({ state, seat: 9 })).toBe(true)
		const holder = DISTRICT_FIXTURE.person({ fixture, seat: 9, father: -1 })
		roll.mockClear()
		pay(FEES[top] - 1e-9)
		hold()
		expect(roll).not.toHaveBeenCalled()
		expect(created(state)).toBe(0)
		expect(total(state.coronations.held)).toBe(1)
		afford(top, "lavish")
		elevate()
		expect(roll).not.toHaveBeenCalled()
		state.time += STATE.yearMs
		hold()
		expect(roll).toHaveBeenCalledTimes(1)
		expect(created(state)).toBe(1)
		expect(state.titles.tier[4]).toBe(2)
		expect(STATE_TITLES.topTier({ state, realm: 0 })).toBe(top)
		const cell = cellOf(state.coronations, "accession")
		expect(cell("held", top, "lavish")).toBe(1)
		expect(cell("ducats", top, "lavish")).toBe(2 * FEES[top])
		expect(cell("founded", 2, "lavish")).toBe(1)
		expect(total(state.coronations.founded)).toBe(1)
		expect(total(state.coronations.raised)).toBe(0)
		expect(total(state.coronations.held)).toBe(2)
		expect(state.people.memories.get(holder)?.get(ruler)).toEqual([
			{ reason: "coronation_lavish", start: state.time / STATE.yearMs },
		])
		expect(state.compositeRealm[0]).toBe(0)
		STATE.validateLiveHierarchy({ state, context: "accession founding" })
		expectIdentities(state.coronations)
	}
})

it("leaves no trace of an elevation that fails its roll, loses its children or finds the registry full", () => {
	const { fixture, state, pay, elevate, roll } = realm(TWO_DUCHIES)
	DISTRICT_FIXTURE.person({ fixture, seat: 2, father: -1 })
	roll.mockClear()
	pay(1000)
	roll.mockReturnValue(1)
	elevate()
	expect(roll).toHaveBeenCalledTimes(1)
	expect(state.compositeRealm[0]).toBe(1)
	roll.mockReturnValue(0)
	roll.mockClear()
	state.titles.holder[1] = -1
	elevate()
	expect(roll).not.toHaveBeenCalled()
	expect(state.compositeRealm[0]).toBe(0)
	state.titles.holder[1] = 0
	state.titles.count = state.titles.tier.length
	const notes = state.events.length
	elevate()
	expect(roll).toHaveBeenCalledTimes(1)
	expect(created(state)).toBe(0)
	expect(state.events).toHaveLength(notes)
	expect(state.treasuryCurrent[0]).toBe(1000)
	expect(state.treasuryBudgetCurrent.get(0)?.otherChangesTotal ?? 0).toBe(0)
	expect(state.people.memories.size).toBe(0)
	expect(total(state.coronations.held)).toBe(0)
	expect(total(state.coronations.founded)).toBe(0)
	expect(state.coronations.compositeRealmYears).toBe(2)
})

it("requires the children to reach the new rank's minimum size before any roll or flag", () => {
	const { fixture, state, pay, elevate, roll } = realm(SMALL_DUCHIES)
	pay(1000)
	for (let year = 0; year < 3; year++) {
		elevate()
		expect(state.compositeRealm[0]).toBe(0)
	}
	expect(roll).not.toHaveBeenCalled()
	expect(created(state)).toBe(0)
	expect(state.treasuryCurrent[0]).toBe(1000)
	expect(state.coronations.compositeRealmYears).toBe(0)
	fixture.members = range(0, 8)
	for (const p of fixture.members) {
		state.parentCurrent[p] = p === 0 ? -1 : 0
		state.desolate[p] = 0
		state.stateless[p] = 0
	}
	state.hierarchyDirty = true
	DISTRICT_FIXTURE.titles({ fixture, titles: TWO_DUCHIES })
	elevate()
	expect(roll).toHaveBeenCalledTimes(1)
	expect(created(state)).toBe(1)

	for (const tier of [2, 3, 4]) {
		const minimum = [1, 2, 8, 40, 180][tier]
		for (const size of [minimum - 1, minimum]) {
			const count = 200
			const titles = {
				count: 2,
				tier: new Uint8Array(8),
				seat: new Int32Array(8).fill(-1),
				holder: new Int32Array(8).fill(-1),
				regionOf: new Int32Array(4 * count).fill(-1),
			}
			for (let i = 0; i < 2; i++) {
				titles.tier[i] = tier - 1
				titles.seat[i] = i
				titles.holder[i] = 0
			}
			for (let p = 0; p < size; p++)
				titles.regionOf[(tier - 2) * count + p] = p === 0 ? 0 : 1
			const members = DEJURE.membersOf({ titles, provinceCount: count })
			const ownerOf = new Int32Array(count)
			expect(FOUNDING.qualifies({ members, children: [0, 1], tier })).toBe(
				size === minimum,
			)
			expect(
				FOUNDING.qualifying({ titles, members, provinceCount: count, ownerOf }),
			).toEqual(size === minimum ? [{ holder: 0, tier, children: [0, 1] }] : [])
			expect(
				FOUNDING.found({
					titles,
					members,
					provinceCount: count,
					ownerOf,
					rank: new Uint8Array(count),
					habitability: new Float32Array(count),
					urbanPop: new Float32Array(count),
					waterAccess: new Uint8Array(count),
					holder: 0,
					tier,
					children: [0, 1],
				}) !== null,
			).toBe(size === minimum)
		}
	}
})

it("prices an elevation with ample cash above customary and never founds at or below the realm's rank mid-reign", () => {
	const rich = realm(TWO_DUCHIES)
	const holders = [2, 6].map((seat) =>
		DISTRICT_FIXTURE.person({ fixture: rich.fixture, seat, father: -1 }),
	)
	rich.afford(2, "magnificent")
	rich.elevate()
	expect(created(rich.state)).toBe(1)
	const richCell = cellOf(rich.state.coronations, "elevation")
	expect(
		richCell("held", 2, "lavish") + richCell("held", 2, "magnificent"),
	).toBe(1)
	expect(
		richCell("founded", 2, "lavish") + richCell("founded", 2, "magnificent"),
	).toBe(1)
	for (const seat of [2, 6])
		expect(STATE_TITLES.isDistrictSeat({ state: rich.state, seat })).toBe(false)
	for (const holder of holders)
		expect(
			rich.state.people.memories.get(holder)?.get(rich.ruler),
		).toHaveLength(1)
	expect(total(rich.state.coronations.memories)).toBe(2)
	expectIdentities(rich.state.coronations)

	for (const tier of [2, 3]) {
		const { state, pay, elevate, roll } = realm([
			{ tier, seat: 0, provinces: [0] },
			{ tier: 1, seat: 1, provinces: [1, 2, 3, 4] },
			{ tier: 1, seat: 5, provinces: [5, 6, 7, 8] },
		])
		expect(STATE_TITLES.topTier({ state, realm: 0 })).toBe(tier)
		expect(
			STATE_TITLES.qualified({ state, nation: 0 }).map((entry) => entry.tier),
		).toEqual([2])
		pay(1000)
		for (let year = 0; year < 2; year++) elevate()
		expect(roll).not.toHaveBeenCalled()
		expect(created(state)).toBe(0)
		expect(state.treasuryCurrent[0]).toBe(1000)
		expect(state.compositeRealm[0]).toBe(0)
		expect(total(state.coronations.held)).toBe(0)
		expect(state.coronations.compositeRealmYears).toBe(0)
	}
})

it("charges once on the one-off line, never on credit and never again through tax previews", () => {
	const { state, pay, hold, afford } = realm(KINGDOM)
	pay(-1)
	hold()
	expect(state.treasuryCurrent[0]).toBe(-1)
	expect(state.treasuryBudgetCurrent.get(0)?.otherChangesTotal ?? 0).toBe(0)
	expect(cellOf(state.coronations, "accession")("held", 2, "uncrowned")).toBe(1)

	afford(2, "humble")
	TAX.previewBudget({ state })
	const annual = TREASURY_BUDGET.get({ state, p: 0 }).annualBalance
	hold()
	const budget = TREASURY_BUDGET.get({ state, p: 0 })
	expect(budget.coronationExpenses).toBe(-FEES[2] / 2)
	expect(budget.otherChangesTotal).toBe(-FEES[2] / 2)
	expect(budget.annualBalance).toBe(annual)
	const cash = state.treasuryCurrent[0]
	expect(cash).toBe(0)
	TAX.previewBudget({ state })
	TAX.previewBudget({ state })
	expect(state.treasuryCurrent[0]).toBe(cash)
	expect(budget.coronationExpenses).toBe(-FEES[2] / 2)
	expectIdentities(state.coronations)
})

it("defers a child's coronation to sixteen and never crowns under a regent", () => {
	const { state, rng, ruler, pay, hold } = realm(KINGDOM)
	const people = state.people
	child(state, ruler)
	REGENCY.start({ state, realm: 0 })
	expect(GOVERNOR.regency({ state, realm: 0 })?.cause).toBe("minority")
	pay(FEES[2])
	hold()
	const leader = state.leaderRuntime.idx[0]
	expect(state.treasuryCurrent[0]).toBe(FEES[2])
	expect(state.coronationOwed[0]).toBe(leader)
	expect(state.coronations).toMatchObject({ deferred: 1, majority: 0 })
	expect(total(state.coronations.held)).toBe(0)
	expect(people.memories.size).toBe(0)

	state.time += 6 * STATE.yearMs
	pay(2 * FEES[2])
	REGENCY.comeOfAge({ state, realm: 0, leader, rng })
	expect(GOVERNOR.regency({ state, realm: 0 })).toBeNull()
	expect(state.coronationOwed[0]).toBe(-1)
	expect(state.coronations).toMatchObject({ deferred: 1, majority: 1 })
	expect(total(state.coronations.held)).toBe(1)
	expect(state.treasuryCurrent[0]).toBeLessThanOrEqual(FEES[2])
	const cash = state.treasuryCurrent[0]
	REGENCY.comeOfAge({ state, realm: 0, leader, rng })
	expect(state.treasuryCurrent[0]).toBe(cash)
	expect(total(state.coronations.held)).toBe(1)
	expectIdentities(state.coronations)
})

it("cancels a deferred coronation when the ward is replaced and holds nothing for a stale coming of age", () => {
	const { fixture, state, rng, ruler, pay, hold } = realm(KINGDOM)
	child(state, ruler)
	REGENCY.start({ state, realm: 0 })
	hold()
	const leader = state.leaderRuntime.idx[0]
	expect(state.coronationOwed[0]).toBe(leader)
	REGENCY.end({ state, realm: 0, cause: "death" })
	const adult = DISTRICT_FIXTURE.person({ fixture, seat: -1, father: -1 })
	STATE.installRuler({
		state,
		p: 0,
		person: adult,
		claim: 3,
		reason: "succession",
	})
	pay(FEES[2])
	hold()
	expect(state.coronationOwed[0]).toBe(-1)
	expect(total(state.coronations.held)).toBe(1)
	state.time += 6 * STATE.yearMs
	pay(FEES[2])
	REGENCY.comeOfAge({ state, realm: 0, leader, rng })
	expect(state.treasuryCurrent[0]).toBe(FEES[2])
	expect(state.coronations).toMatchObject({ deferred: 1, majority: 0 })
	expect(total(state.coronations.held)).toBe(1)
})

it("never crowns a ruler who accedes incapable and passes an incapable ward into an incapacity regency at sixteen", () => {
	const accession = realm(KINGDOM)
	const incapable = vi
		.spyOn(AGEING, "incapable")
		.mockImplementation(({ person }) => person === accession.ruler)
	try {
		REGENCY.start({ state: accession.state, realm: 0 })
		expect(GOVERNOR.regency({ state: accession.state, realm: 0 })?.cause).toBe(
			"incapacity",
		)
		accession.pay(1000)
		accession.hold()
		expect(accession.state.treasuryCurrent[0]).toBe(1000)
		expect(accession.state.coronationOwed[0]).toBe(-1)
		expect(accession.state.coronations).toMatchObject({
			deferred: 0,
			majority: 0,
			incapable: 1,
		})
		expect(total(accession.state.coronations.held)).toBe(0)
	} finally {
		incapable.mockRestore()
	}

	for (const acceded of [true, false]) {
		const { state, rng, ruler, pay, hold, elevate, roll } = realm(TWO_DUCHIES)
		child(state, ruler)
		REGENCY.start({ state, realm: 0 })
		pay(1000)
		if (acceded) hold()
		const leader = state.leaderRuntime.idx[0]
		expect(state.coronationOwed[0]).toBe(acceded ? leader : -1)
		state.time += 6 * STATE.yearMs
		const ward = vi
			.spyOn(AGEING, "incapable")
			.mockImplementation(({ person }) => person === ruler)
		try {
			const before = state.events.length
			REGENCY.comeOfAge({ state, realm: 0, leader, rng })
			const notes = state.events
				.slice(before)
				.filter((note) => note.tag.startsWith("regency"))
			expect(notes.map((note) => note.tag)).toEqual([
				"regency ended",
				"regency started",
			])
			expect(notes[0].data.cause).toBe("age")
			expect(notes[1].data.regencyCause).toBe("incapacity")
			expect(notes[1].time).toBe(notes[0].time)
			for (let year = 0; year < 2; year++) {
				REGENCY.review({ state })
				elevate()
				expect(GOVERNOR.regency({ state, realm: 0 })?.cause).toBe("incapacity")
				expect(state.compositeRealm[0]).toBe(1)
			}
			expect(roll).not.toHaveBeenCalled()
		} finally {
			ward.mockRestore()
		}
		expect(state.treasuryCurrent[0]).toBe(1000)
		expect(state.coronationOwed[0]).toBe(-1)
		expect(state.coronations).toMatchObject({
			deferred: acceded ? 1 : 0,
			majority: 0,
			incapable: acceded ? 1 : 0,
		})
		expect(total(state.coronations.held)).toBe(0)
		expect(created(state)).toBe(0)
	}
})

it("ends an excluded minor's regency at sixteen with no coronation and no second regency for a capable ward", () => {
	const { state, rng, ruler, pay } = realm(KINGDOM)
	child(state, ruler)
	REGENCY.start({ state, realm: 0 })
	pay(1000)
	expect(state.coronationOwed[0]).toBe(-1)
	state.time += 6 * STATE.yearMs
	const before = state.events.length
	REGENCY.comeOfAge({
		state,
		realm: 0,
		leader: state.leaderRuntime.idx[0],
		rng,
	})
	expect(
		state.events
			.slice(before)
			.filter((note) => note.tag.startsWith("regency"))
			.map((note) => note.tag),
	).toEqual(["regency ended"])
	expect(GOVERNOR.regency({ state, realm: 0 })).toBeNull()
	expect(state.treasuryCurrent[0]).toBe(1000)
	expect(state.coronationOwed[0]).toBe(-1)
	expect(state.people.memories.size).toBe(0)
	expect(structuredClone(state.coronations)).toEqual(
		CORONATION_COUNTERS.create(),
	)
})

it("leaves each district holder one coronation memory that follows the quality and fades in ten years", () => {
	const values: [CoronationQuality, number][] = [
		["uncrowned", -20],
		["humble", -10],
		["customary", 0],
		["lavish", 10],
		["magnificent", 20],
	]
	for (const [quality, value] of values) {
		const { fixture, state, ruler, pay, afford, hold } = realm([
			{ tier: 1, seat: 0, provinces: [0, 1, 2, 3] },
		])
		const people = state.people
		const holders = [1, 2].map((seat) =>
			DISTRICT_FIXTURE.person({ fixture, seat, father: -1 }),
		)
		PEOPLE.setRuler({
			people,
			person: ruler,
			seat: 3,
			rank: 0,
			reason: "district grant",
		})
		const time = state.time / STATE.yearMs
		const opinion = (holder: number, at: number) =>
			OPINION.of({
				observer: holder,
				target: ruler,
				time: at,
				context: LIVE_OPINION_CONTEXT.of({ state, time: at }),
			})
		const loyalty = holders.map((holder) =>
			OPINION.loyaltyOf({ breakdown: opinion(holder, time) }),
		)
		if (quality === "uncrowned") pay(-1)
		else afford(1, quality)
		hold()
		const cell = cellOf(state.coronations, "accession")
		expect(cell("held", 1, quality)).toBe(1)
		expect(cell("memories", 1, quality)).toBe(value === 0 ? 0 : 2)
		expect(people.memories.has(ruler)).toBe(false)
		for (const [index, holder] of holders.entries()) {
			expect(people.memories.get(holder)?.get(ruler) ?? []).toEqual(
				value === 0 ? [] : [{ reason: `coronation_${quality}`, start: time }],
			)
			expect(
				OPINION.loyaltyOf({ breakdown: opinion(holder, time) }) -
					loyalty[index],
			).toBe(value)
			expect(opinion(holder, time + 5)?.memories).toBe(value / 2)
			expect(opinion(holder, time + 10)?.memories).toBe(0)
		}
		expectIdentities(state.coronations)
	}
})

it("replaces an earlier coronation memory in the live state and the record, and sums it with other reasons", () => {
	const { fixture, state, ruler, pay, afford, hold } = realm([
		{ tier: 1, seat: 0, provinces: [0, 1, 2, 3] },
	])
	const people = state.people
	const holder = DISTRICT_FIXTURE.person({ fixture, seat: 1, father: -1 })
	const start = state.time / STATE.yearMs
	afford(1, "magnificent")
	hold()
	OPINION.remember({
		people,
		observer: holder,
		target: ruler,
		reason: "grant",
		time: start,
	})
	state.time += STATE.yearMs
	afford(1, "customary")
	hold()
	expect(people.memories.get(holder)?.get(ruler)).toEqual([
		{ reason: "coronation_magnificent", start },
		{ reason: "grant", start },
	])
	pay(-1)
	hold()
	expect(people.memories.get(holder)?.get(ruler)).toEqual([
		{ reason: "coronation_uncrowned", start: start + 1 },
		{ reason: "grant", start },
	])
	expect(
		OPINION.of({
			observer: holder,
			target: ruler,
			time: start + 1,
			context: LIVE_OPINION_CONTEXT.of({ state, time: start + 1 }),
		})?.memories,
	).toBe(-20 + 13.5)

	const marriage = MARRIAGE_FIXTURE.create()
	for (const sex of [0, 1] as const)
		MARRIAGE_FIXTURE.add({ fixture: marriage, age: 30, sex, realm: 0 })
	const record = PEOPLE_RECORD.create()
	const remember = (
		reason: "coronation_magnificent" | "coronation_uncrowned" | "grant",
		time: number,
	) =>
		OPINION.remember({
			people: marriage.people,
			observer: 0,
			target: 1,
			reason,
			time,
		})
	const flush = (time: number) =>
		PEOPLE_RECORD.append({
			record,
			packet: structuredClone(
				PEOPLE_LOG.seal({ people: marriage.people, sovereign: () => true }),
			),
			timeMs: time * STATE.yearMs,
			recordTime: (year) => year * STATE.yearMs,
		})
	const recorded = (time: number) =>
		PERSON_QUERY.memories({
			people: record,
			a: 0,
			b: 1,
			timeMs: time * STATE.yearMs,
		})
	remember("coronation_magnificent", 100)
	remember("grant", 100)
	flush(100)
	remember("coronation_uncrowned", 101)
	flush(101)
	expect(recorded(100.5)).toEqual([
		{
			reason: "coronation_magnificent",
			startTimeMs: 100 * STATE.yearMs,
			strength: 19,
		},
		{ reason: "grant", startTimeMs: 100 * STATE.yearMs, strength: 14.25 },
	])
	expect(recorded(101)).toEqual([
		{
			reason: "coronation_uncrowned",
			startTimeMs: 101 * STATE.yearMs,
			strength: -20,
		},
		{ reason: "grant", startTimeMs: 100 * STATE.yearMs, strength: 13.5 },
	])
})

it("lets an elevation's gifts replace the accession's and a customary elevation leave them alone", () => {
	for (const later of ["magnificent", "customary"] as const) {
		const { fixture, state, ruler, afford, hold, elevate } = realm(TWO_DUCHIES)
		const holder = DISTRICT_FIXTURE.person({ fixture, seat: 2, father: -1 })
		const start = state.time / STATE.yearMs
		afford(1, "lavish")
		hold()
		expect(state.people.memories.get(holder)?.get(ruler)).toEqual([
			{ reason: "coronation_lavish", start },
		])
		state.time += 3 * STATE.yearMs
		afford(2, later)
		elevate()
		expect(created(state)).toBe(1)
		expect(state.people.memories.get(holder)?.get(ruler)).toEqual([
			later === "customary"
				? { reason: "coronation_lavish", start }
				: { reason: "coronation_magnificent", start: start + 3 },
		])
		expectIdentities(state.coronations)
	}
})

it("elevates unrelated realms in ascending id and requalifies realms that shared a divided title", () => {
	const duchies = (from: number): DistrictTitle[] => [
		{ tier: 1, seat: from + 1, provinces: range(from, from + 4) },
		{ tier: 1, seat: from + 5, provinces: range(from + 4, from + 8) },
	]
	const realms = [
		{ root: 0, titles: duchies(0) },
		{ root: 8, titles: duchies(8) },
	]
	const fund = (state: HistoryState) => {
		for (const root of [0, 8])
			FIELDS.prov.treasury.set({ state, p: root, value: FEES[2] })
	}
	const founders = (state: HistoryState) =>
		state.events
			.filter((note) => note.tag === "title created")
			.map((note) => note.data.holder)

	const apart = world({ realms, shared: [] })
	fund(apart.state)
	apart.elevate()
	expect(founders(apart.state)).toEqual([0, 8])
	expect(apart.roll).toHaveBeenCalledTimes(2)
	expect(apart.state.treasuryCurrent[0]).toBe(0)
	expect(apart.state.treasuryCurrent[8]).toBe(0)
	expect(total(apart.state.coronations.raised)).toBe(2)
	expect(apart.state.coronations.compositeRealmYears).toBe(0)
	expectIdentities(apart.state.coronations)

	const old: DistrictTitle[] = [{ tier: 2, seat: 0, provinces: range(0, 16) }]
	const shared = world({ realms, shared: old })
	fund(shared.state)
	expect(
		STATE_TITLES.qualifying({ state: shared.state }).map((entry) => [
			entry.holder,
			entry.tier,
		]),
	).toEqual([
		[0, 2],
		[8, 2],
	])
	shared.elevate()
	expect(founders(shared.state)).toEqual([0])
	expect(shared.roll).toHaveBeenCalledTimes(1)
	expect(shared.state.titles.holder[4]).toBe(8)
	expect(shared.state.treasuryCurrent[8]).toBe(FEES[2])
	expect(shared.state.compositeRealm[0]).toBe(0)
	expect(shared.state.compositeRealm[8]).toBe(0)
	expect(shared.state.coronations.compositeRealmYears).toBe(0)
	expect(total(shared.state.coronations.held)).toBe(1)
	STATE.validateLiveHierarchy({ state: shared.state, context: "shared parent" })

	const second = world({ realms, shared: old })
	fund(second.state)
	second.roll.mockReturnValueOnce(1)
	second.elevate()
	expect(founders(second.state)).toEqual([8])
	expect(second.state.treasuryCurrent[0]).toBe(FEES[2])
	expect(second.state.treasuryCurrent[8]).toBe(0)
})

it("skips realms without a ruler or under a regent and flags them all the same", () => {
	const vacant = realm(TWO_DUCHIES)
	vacant.pay(1000)
	PEOPLE.vacate({
		people: vacant.state.people,
		seat: 0,
		reason: "succession",
	})
	vacant.elevate()
	expect(vacant.roll).not.toHaveBeenCalled()
	expect(created(vacant.state)).toBe(0)

	const { state, ruler, pay, elevate, roll } = realm(TWO_DUCHIES)
	child(state, ruler)
	REGENCY.start({ state, realm: 0 })
	pay(1000)
	elevate()
	expect(roll).not.toHaveBeenCalled()
	expect(created(state)).toBe(0)
	expect(state.treasuryCurrent[0]).toBe(1000)
	expect(state.compositeRealm[0]).toBe(1)
})

it("flags a realm that qualifies above its rank until it is raised or loses the lands", () => {
	const { state, pay, elevate, roll } = realm(TWO_DUCHIES)
	expect(state.compositeRealm[0]).toBe(0)
	pay(-1)
	elevate()
	expect(roll).not.toHaveBeenCalled()
	expect(state.compositeRealm[0]).toBe(1)
	pay(1000)
	roll.mockReturnValue(1)
	elevate()
	expect(state.compositeRealm[0]).toBe(1)
	state.titles.holder[1] = -1
	elevate()
	expect(state.compositeRealm[0]).toBe(0)
	state.titles.holder[1] = 0
	roll.mockReturnValue(0)
	elevate()
	expect(created(state)).toBe(1)
	expect(state.coronations.compositeRealmYears).toBe(2)
	expect(Array.from(state.compositeRealm).every((flag) => flag === 0)).toBe(
		true,
	)

	const kingdom = realm([
		{ tier: 2, seat: 0, provinces: range(0, 20) },
		{ tier: 2, seat: 20, provinces: range(20, 40) },
	])
	expect(STATE_TITLES.topTier({ state: kingdom.state, realm: 0 })).toBe(2)
	kingdom.pay(FEES[3] - 1e-9)
	kingdom.elevate()
	expect(kingdom.state.compositeRealm[0]).toBe(1)
	kingdom.pay(FEES[3])
	kingdom.elevate()
	expect(created(kingdom.state)).toBe(1)
	expect(STATE_TITLES.topTier({ state: kingdom.state, realm: 0 })).toBe(3)
	expect(kingdom.state.compositeRealm[0]).toBe(0)
	expect(
		cellOf(kingdom.state.coronations, "elevation")("raised", 3, "customary"),
	).toBe(1)
})

it("makes a composite realm's districts one weak-claim step easier to lose", () => {
	const { fixture, state, rng, roll } = realm(TWO_DUCHIES)
	DISTRICT_FIXTURE.person({ fixture, seat: 2, father: -1 })
	const real = MILITARY.rebellionPreview({ state, overlord: 0, subject: 2 })
	const preview = vi.spyOn(MILITARY, "rebellionPreview")
	const release = vi.spyOn(STATE, "releaseProvince").mockReturnValue(undefined)
	const fix = vi.spyOn(STATE, "fixConnections").mockReturnValue(undefined)
	const truce = vi.spyOn(TRUCE, "sign").mockReturnValue(undefined)
	const seeks = vi.spyOn(OVERTHROW, "seeks").mockReturnValue([])
	const check = (threat: number) => {
		preview.mockReturnValue({ ...real, threat })
		const rebelled = WAR.rebel({
			state,
			overlord: 0,
			subject: 2,
			laxity: 0,
			succession: false,
			rng,
		})
		const note = state.events.findLast(
			(entry) => entry.tag === "rebellion evaluated",
		)
		if (!note) throw new Error("no evaluation")
		return { rebelled, data: note.data }
	}
	try {
		const clear = check(0)
		expect(clear.data.composite).toBe(false)
		const threshold = clear.data.threshold as number
		const between = threshold - 0.025
		expect(check(between).rebelled).toBe(false)
		expect(state.coronations.compositeEvaluations).toBe(0)
		state.compositeRealm[0] = 1
		const flagged = check(0)
		expect(flagged.data.composite).toBe(true)
		expect(flagged.data.laxity as number).toBeCloseTo(
			(clear.data.laxity as number) + 0.05,
			12,
		)
		expect(flagged.data.threshold as number).toBeCloseTo(threshold - 0.05, 12)
		expect(check(between).rebelled).toBe(true)
		expect(release).toHaveBeenCalledTimes(1)
		expect(state.coronations).toMatchObject({
			compositeEvaluations: 2,
			compositeRebellions: 1,
		})
		state.people.regencies.set(0, {
			ward: state.people.rulerOf[0],
			cause: "minority",
			regent: -1,
			kind: "council",
		})
		const regency = check(0)
		expect(regency.data.composite).toBe(true)
		expect(regency.data.threshold as number).not.toBeCloseTo(
			threshold - 0.05,
			6,
		)
	} finally {
		for (const spy of [preview, release, fix, truce, seeks, roll])
			spy.mockRestore()
	}
})

it("finds the same qualifying children as the per-realm scan and reads each title's members once", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const perRealm = (target: HistoryState) => {
		const expected: { holder: number; tier: number; children: number[] }[] = []
		for (let nation = 0; nation < target.P; nation++) {
			if (!STATE.isSovereign({ state: target, p: nation })) continue
			for (const founding of STATE_TITLES.qualified({ state: target, nation }))
				expected.push({ holder: nation, ...founding })
		}
		return expected
	}
	expect(STATE_TITLES.qualifying({ state })).toEqual(perRealm(state))

	const several = world({
		realms: [
			{
				root: 0,
				titles: [
					{ tier: 1, seat: 1, provinces: range(0, 4) },
					{ tier: 1, seat: 5, provinces: range(4, 8) },
					{ tier: 1, seat: 9, provinces: range(8, 12) },
				],
			},
			{
				root: 12,
				titles: [
					{ tier: 1, seat: 13, provinces: range(12, 16) },
					{ tier: 1, seat: 17, provinces: range(16, 20) },
				],
			},
		],
		shared: [{ tier: 2, seat: 0, provinces: range(0, 20) }],
	})
	const found = STATE_TITLES.qualifying({ state: several.state })
	expect(found).toEqual(perRealm(several.state))
	expect(found).toEqual([
		{ holder: 0, tier: 2, children: [0, 1, 2] },
		{ holder: 12, tier: 2, children: [3, 4] },
	])
	const members = several.state.titleMembers
	const reads = new Int32Array(members.list.length)
	FOUNDING.qualifying({
		titles: several.state.titles,
		members: {
			offset: members.offset,
			list: new Proxy(members.list, {
				get(target, key) {
					if (typeof key === "string" && /^\d+$/.test(key)) reads[Number(key)]++
					return Reflect.get(target, key, target)
				},
			}),
		},
		provinceCount: several.state.P,
		ownerOf: several.state.sovereignCurrent,
	})
	expect(Math.max(...reads)).toBe(1)
})

it("reports coronations per window, carrying a deferred coronation into the window it is held in", () => {
	const { state, rng, ruler, pay, hold, elevate, roll } = realm(TWO_DUCHIES)
	const tracker = PEOPLE_OPINION_REPORT.tracker()
	const record = PEOPLE_RECORD.create()
	const start = Math.round(state.time / STATE.yearMs)
	const window = (from: number, to: number) =>
		PEOPLE_OPINION_REPORT.of({ engine: state, tracker, record, from, to })
	child(state, ruler)
	REGENCY.start({ state, realm: 0 })
	hold()
	roll.mockReturnValue(1)
	elevate()
	const first = window(start, start + 1).statistics.coronations
	expect(first).toMatchObject({
		deferred: 1,
		majority: 0,
		incapable: 0,
		compositeRealmYears: 1,
		compositeEvaluations: 0,
		compositeRebellions: 0,
	})
	expect(first.accession.held.flat().every((count) => count === 0)).toBe(true)
	state.time += 6 * STATE.yearMs
	pay(FEES[1])
	REGENCY.comeOfAge({
		state,
		realm: 0,
		leader: state.leaderRuntime.idx[0],
		rng,
	})
	pay(FEES[2])
	roll.mockReturnValue(0)
	elevate()
	const report = window(start + 1, start + 7)
	const second = report.statistics.coronations
	expect(second).toMatchObject({
		deferred: 0,
		majority: 1,
		incapable: 0,
		compositeRealmYears: 0,
	})
	expect(second.accession.held[1]).toEqual([0, 0, 1, 0, 0])
	expect(second.accession.ducats[1]).toEqual([0, 0, FEES[1], 0, 0])
	expect(second.elevation.held[2]).toEqual([0, 0, 1, 0, 0])
	expect(second.elevation.founded[2]).toEqual([0, 0, 1, 0, 0])
	expect(second.elevation.raised[2]).toEqual([0, 0, 1, 0, 0])
	expect(
		[...second.accession.ducats, ...second.elevation.ducats]
			.flat()
			.reduce((sum, value) => sum + value, 0),
	).toBe(-TREASURY_BUDGET.get({ state, p: 0 }).coronationExpenses)
	expect(report.cost.elevateMsPerYear).toBeGreaterThanOrEqual(0)
	expect(state.coronations).toMatchObject({ deferred: 1, majority: 1 })
	const third = window(start + 7, start + 8).statistics.coronations
	expect(third).toMatchObject({ deferred: 0, majority: 0 })
	expect(third.accession.held.flat().every((count) => count === 0)).toBe(true)
	expect(third.elevation.held.flat().every((count) => count === 0)).toBe(true)
	expectIdentities(state.coronations)
})

function generated(tier: number) {
	const { engine: state, generated: world } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const provinces = Array.from({ length: state.P }, (_, p) => p).filter(
		(p) => !state.desolate[p] && !state.stateless[p],
	)
	const nation = state.sovereignCurrent[provinces[0]]
	for (const p of provinces) state.parentCurrent[p] = p === nation ? -1 : nation
	state.hierarchyDirty = true
	state.titles = {
		count: 2,
		tier: new Uint8Array(state.P),
		seat: new Int32Array(state.P).fill(-1),
		holder: new Int32Array(state.P).fill(-1),
		regionOf: new Int32Array(4 * state.P).fill(-1),
	}
	for (let i = 0; i < 2; i++) {
		state.titles.tier[i] = tier - 1
		state.titles.seat[i] = provinces[i * 90]
		state.titles.holder[i] = nation
		for (const p of provinces.slice(i * 90, (i + 1) * 90))
			state.titles.regionOf[(tier - 2) * state.P + p] = i
	}
	state.titleMembers = DEJURE.membersOf({
		titles: state.titles,
		provinceCount: state.P,
	})
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
	})
	state.titleFounded.fill(0)
	state.titleLapseSince.fill(-1)
	STATE_TITLES.applyDerivedParents({ state, nation, members: provinces })
	state.realmCache.clear()
	state.treasuryBudgetCurrent.clear()
	state.pendingJournal = JOURNAL.pending()
	if (!world.nations) throw new Error("no nations")
	world.nations.titles = {
		...structuredClone(state.titles),
		tier: state.titles.tier.slice(0, 2),
		seat: state.titles.seat.slice(0, 2),
		holder: state.titles.holder.slice(0, 2),
	}
	world.nations.parent = state.parentCurrent.slice()
	world.nations.sovereign = state.sovereignCurrent.slice()
	const rng = HISTORY_RNG.createHistoryRng(1729)
	const time = state.time / STATE.yearMs
	const ruler = FAMILY.found({
		people: state.people,
		origin: STATE.originOf({ state, realm: nation }),
		time,
		age: 40,
		rank: 1,
		rng,
	})
	state.people.persons.death[ruler] = time + 60
	STATE.installRuler({
		state,
		p: nation,
		person: ruler,
		claim: 3,
		reason: "succession",
	})
	PEOPLE_LOG.seal({ people: state.people, sovereign: () => true })
	state.events.length = 0
	state.journal.length = 0
	vi.spyOn(rng, "random").mockReturnValue(0)
	FIELDS.prov.treasury.set({ state, p: nation, value: FEES[tier] })
	return {
		state,
		nation,
		rng,
		world: world as unknown as SerializedGenesisWorld,
		provinces,
	}
}

it("destroys a lapsed title at an accession without a refund and charges the refounding elevation again", () => {
	const { state, nation, rng } = generated(2)
	const hold = () => CORONATION.hold({ state, realm: nation, rng })
	const elevate = () => CORONATION.elevate({ state, rng })
	const pay = (value: number) =>
		FIELDS.prov.treasury.set({ state, p: nation, value })
	elevate()
	expect(created(state)).toBe(1)
	expect(state.treasuryCurrent[nation]).toBe(0)
	JOURNAL.flush({ state, noteCursor: 0, census: true, initial: false })
	state.titles.holder[1] = -1
	pay(-1)
	hold()
	state.time += 25 * STATE.yearMs
	elevate()
	expect(
		state.events.filter((note) => note.tag === "title destroyed"),
	).toHaveLength(0)
	hold()
	expect(
		state.events.filter((note) => note.tag === "title destroyed"),
	).toHaveLength(1)
	expect(state.treasuryCurrent[nation]).toBe(-1)
	expect(TREASURY_BUDGET.get({ state, p: nation }).coronationExpenses).toBe(0)
	state.titles.holder[1] = nation
	pay(FEES[2])
	elevate()
	expect(created(state)).toBe(2)
	expect(state.treasuryCurrent[nation]).toBe(0)
	expect(TREASURY_BUDGET.get({ state, p: nation }).coronationExpenses).toBe(
		-FEES[2],
	)
	expect(total(state.coronations.founded)).toBe(2)
	expectIdentities(state.coronations)
})

it("records the fee only in the covering census and retains frames between censuses", () => {
	const { state, nation, rng, world } = generated(2)
	const record = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: state.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: record, world })
	JOURNAL.flush({ state, noteCursor: 0, census: true, initial: true })
	SIM_RECORD.appendJournal({
		translator,
		transactions: state.journal.splice(0),
	})
	const before = HISTORY.frameAt({
		state: record,
		timeMs: record.record.maxTimeMs,
	}).economy
	state.time += STATE.yearMs / 2
	CORONATION.elevate({ state, rng })
	JOURNAL.flush({ state, noteCursor: 0, census: false, initial: false })
	SIM_RECORD.appendJournal({
		translator,
		transactions: state.journal.splice(0),
	})
	expect(
		HISTORY.frameAt({ state: record, timeMs: record.record.maxTimeMs }).economy,
	).toBe(before)
	state.time += STATE.yearMs / 2
	JOURNAL.flush({
		state,
		noteCursor: state.events.length,
		census: true,
		initial: false,
	})
	const covering = state.journal[0].census?.economy
	const index = covering?.nations.indexOf(nation) ?? -1
	expect(index).toBeGreaterThanOrEqual(0)
	expect(covering?.budgets[index]?.coronationExpenses).toBe(-FEES[2])
	SIM_RECORD.appendJournal({
		translator,
		transactions: state.journal.splice(0),
	})
	const founded = TITLE_TIMELINE.build({
		record: record.record,
		nationId: translator.identityByRoot.get(nation) as number,
		nationName: "Test realm",
		provinceName: (p) => `Province ${p}`,
	}).find((entry) => entry.description.includes("founded"))
	expect(founded).toBeDefined()
	expect(TREASURY_BUDGET.get({ state, p: nation }).coronationExpenses).toBe(0)
	state.time += STATE.yearMs
	JOURNAL.flush({
		state,
		noteCursor: state.events.length,
		census: true,
		initial: false,
	})
	const next = state.journal[0].census?.economy
	expect(next?.budgets[index]?.coronationExpenses).toBe(0)
	expect(covering?.budgets[index]?.coronationExpenses).toBe(-FEES[2])
})

it("crowns at succession and at enthronement without founding", () => {
	const succession = generated(2)
	succession.state.time += STATE.yearMs
	// Whether the realm is partitioned or a district revolts at this succession
	// depends on who inherits in the generated world; the coronation does not.
	succession.state.governmentType[succession.nation] =
		GOVERNMENT.getGovIdx().feudal_monarchy
	const people = succession.state.people
	const dying = people.rulerOf[succession.nation]
	const time = succession.state.time / STATE.yearMs
	const heir = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people,
		sex: 0,
		birth: time - 30,
		survives: time,
		father: dying,
		mother: -1,
		dynasty: people.persons.dynasty[dying],
		origin: STATE.originOf({
			state: succession.state,
			realm: succession.nation,
		}),
		rng: succession.rng,
	})
	people.persons.death[heir] = time + 60
	FIELDS.prov.treasury.set({
		state: succession.state,
		p: succession.nation,
		value: 1000,
	})
	const rebel = vi.spyOn(WAR, "rebel").mockReturnValue(false)
	PERSON_DEATH.kill({
		state: succession.state,
		person: dying,
		cause: "natural",
		rng: succession.rng,
	})
	rebel.mockRestore()
	expect(created(succession.state)).toBe(0)
	expect(
		TREASURY_BUDGET.get({ state: succession.state, p: succession.nation })
			.coronationExpenses,
	).toBe(-total(succession.state.coronations.ducats))
	expect(total(succession.state.coronations.held)).toBe(1)
	expectIdentities(succession.state.coronations)

	const { state, nation, rng, provinces } = generated(2)
	const attacker = provinces.find(
		(p) => p !== nation && state.people.rulerOf[p] >= 0,
	)
	if (attacker === undefined) throw new Error("no claimant")
	const claimant = state.people.rulerOf[attacker]
	const deposed = state.people.rulerOf[nation]
	const war = STATE.createActiveWar({ state, attacker, defender: nation, rng })
	OVERTHROW.enthrone({ state, war, claimant, claim: 3, deposed, rng })
	const crowned = GOVERNOR.regency({ state, realm: nation }) === null
	expect(created(state)).toBe(0)
	expect(total(state.coronations.held)).toBe(crowned ? 1 : 0)
	expect(
		state.treasuryBudgetCurrent.get(nation)?.coronationExpenses ?? 0,
	).toBeCloseTo(-total(state.coronations.ducats), 12)
	expectIdentities(state.coronations)
})
