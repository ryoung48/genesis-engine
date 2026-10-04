import { expect, it, vi } from "vitest"
import { HISTORY } from "@/model/history/record"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { OVERTHROW } from "@/model/history/sim/engine/events/succession/overthrow"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { WAR } from "@/model/history/sim/engine/events/war"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { SIM_RECORD } from "@/model/history/sim/record"
import { DEJURE } from "@/model/society/dejure"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { TITLE_TIMELINE } from "@/ui/genesis/wiki-bridge/title-timeline"

function fixture(tier: number) {
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
	state.events.length = 0
	state.journal.length = 0
	const rng = HISTORY_RNG.createHistoryRng(1729)
	const roll = vi.spyOn(rng, "random").mockReturnValue(0)
	FIELDS.prov.treasury.set({ state, p: nation, value: 1000 })
	return {
		state,
		nation,
		rng,
		roll,
		world: world as unknown as SerializedGenesisWorld,
		provinces,
	}
}

it.each([
	{ tier: 2, cost: 625 / 36 },
	{ tier: 3, cost: 625 / 18 },
	{ tier: 4, cost: 625 / 9 },
])("charges tier $tier exactly once at exact affordability", ({
	tier,
	cost,
}) => {
	const { state, nation, rng } = fixture(tier)
	FIELDS.prov.treasury.set({ state, p: nation, value: cost })
	STATE.considerTitles({ state, nation, rng })
	expect(state.treasuryCurrent[nation]).toBe(0)
	expect(TREASURY_BUDGET.get({ state, p: nation })).toMatchObject({
		titleCreationExpenses: -cost,
		otherChangesTotal: -cost,
		annualBalance: 0,
	})
	expect(
		state.events.filter((note) => note.tag === "title created"),
	).toHaveLength(1)
	expect(state.titles.holder[2]).toBe(nation)
	expect(state.titles.tier[2]).toBe(tier)
	STATE.validateLiveHierarchy({ state, context: "paid founding" })
	STATE.considerTitles({ state, nation, rng })
	expect(state.treasuryCurrent[nation]).toBe(0)
	expect(
		state.events.filter((note) => note.tag === "title created"),
	).toHaveLength(1)
})

it.each([
	625 / 36 - 1e-9,
	-1,
])("rejects cash %s before consuming a roll despite high revenue", (cash) => {
	const { state, nation, rng, roll } = fixture(2)
	expect(ECONOMY.revenue({ state, p: nation })).toBeGreaterThan(625 / 36)
	FIELDS.prov.treasury.set({ state, p: nation, value: cash })
	STATE.considerTitles({ state, nation, rng })
	expect(roll).not.toHaveBeenCalled()
	expect(state.treasuryCurrent[nation]).toBe(cash)
	expect(state.events).toHaveLength(0)
	expect(TREASURY_BUDGET.get({ state, p: nation }).otherChangesTotal).toBe(0)
})

it("does not charge failed rolls, invalid children or a null founding", () => {
	const { state, nation, rng, roll } = fixture(2)
	roll.mockReturnValue(1)
	STATE.considerTitles({ state, nation, rng })
	roll.mockReturnValue(0)
	state.titles.holder[1] = -1
	roll.mockClear()
	STATE.considerTitles({ state, nation, rng })
	expect(roll).not.toHaveBeenCalled()
	state.titles.holder[1] = nation
	state.titles.count = state.titles.tier.length
	STATE.considerTitles({ state, nation, rng })
	expect(state.treasuryCurrent[nation]).toBe(1000)
	expect(state.events).toHaveLength(0)
	expect(TREASURY_BUDGET.get({ state, p: nation }).titleCreationExpenses).toBe(
		0,
	)
})

it("admits a low-revenue buyer and sums multiple payments without tax replay", () => {
	const { state, nation, rng, provinces } = fixture(2)
	state.popRuralCurrent.fill(0)
	state.popUrbanCurrent.fill(0)
	state.realmCache.clear()
	expect(ECONOMY.revenue({ state, p: nation })).toBe(0)
	TAX.previewBudget({ state })
	STATE.considerTitles({ state, nation, rng })
	const firstCash = state.treasuryCurrent[nation]
	expect(firstCash).toBeCloseTo(1000 - 625 / 36, 12)
	const budget = TREASURY_BUDGET.get({ state, p: nation })
	const annual = budget.annualBalance
	expect(annual + budget.otherChangesTotal).toBeCloseTo(annual - 625 / 36, 12)
	for (let i = 0; i < 2; i++) {
		const title = state.titles.count++
		state.titles.tier[title] = 1
		state.titles.seat[title] = provinces[180 + i * 90]
		state.titles.holder[title] = nation
		for (const p of provinces.slice(180 + i * 90, 270 + i * 90))
			state.titles.regionOf[p] = title
	}
	state.titleMembers = DEJURE.membersOf({
		titles: state.titles,
		provinceCount: state.P,
	})
	STATE.considerTitles({ state, nation, rng })
	expect(
		state.events.filter((note) => note.tag === "title created"),
	).toHaveLength(2)
	expect(budget.titleCreationExpenses).toBeCloseTo((-2 * 625) / 36, 12)
	const cash = state.treasuryCurrent[nation]
	TAX.previewBudget({ state })
	TAX.previewBudget({ state })
	expect(state.treasuryCurrent[nation]).toBe(cash)
	state.time += STATE.yearMs
	TAX.previewBudget({ state })
	TAX.previewBudget({ state })
	expect(state.treasuryCurrent[nation]).toBe(cash)
	expect(budget.titleCreationExpenses).toBeCloseTo((-2 * 625) / 36, 12)
	TAX.runTax({ state, nation, previousTime: state.time - STATE.yearMs })
	expect(state.treasuryCurrent[nation]).toBeCloseTo(
		cash + budget.annualBalance,
		10,
	)
	expect(budget.titleCreationExpenses).toBeCloseTo((-2 * 625) / 36, 12)
})

it("destroys without a refund and charges replacement founding in a new interval", () => {
	const { state, nation, rng } = fixture(2)
	STATE.considerTitles({ state, nation, rng })
	const cash = state.treasuryCurrent[nation]
	JOURNAL.flush({ state, noteCursor: 0, census: true, initial: false })
	state.titles.holder[1] = -1
	STATE.considerTitles({ state, nation, rng })
	state.time += 25 * STATE.yearMs
	STATE.considerTitles({ state, nation, rng })
	expect(
		state.events.filter((note) => note.tag === "title destroyed"),
	).toHaveLength(1)
	expect(state.treasuryCurrent[nation]).toBe(cash)
	expect(TREASURY_BUDGET.get({ state, p: nation }).titleCreationExpenses).toBe(
		0,
	)
	state.titles.holder[1] = nation
	STATE.considerTitles({ state, nation, rng })
	expect(
		state.events.filter((note) => note.tag === "title created"),
	).toHaveLength(2)
	expect(state.treasuryCurrent[nation]).toBeCloseTo(1000 - (2 * 625) / 36, 12)
	expect(TREASURY_BUDGET.get({ state, p: nation }).titleCreationExpenses).toBe(
		-625 / 36,
	)
})

it("records the fee only in the covering census and retains frames between censuses", () => {
	const { state, nation, rng, world } = fixture(2)
	const record = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: state.time,
	})
	const translator = SIM_RECORD.createTranslator({ state: record, world })
	expect(
		HISTORY.frameAt({ state: record, timeMs: record.record.maxTimeMs }).economy,
	).toBeNull()
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
	STATE.considerTitles({ state, nation, rng })
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
	expect(covering?.budgets[index]?.titleCreationExpenses).toBe(-625 / 36)
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
	expect((founded?.date ?? 0) * 86400000).toBeLessThan(record.record.maxTimeMs)
	const paid = HISTORY.frameAt({
		state: record,
		timeMs: record.record.maxTimeMs,
	}).economy
	state.time += STATE.yearMs / 2
	expect(
		HISTORY.frameAt({ state: record, timeMs: record.record.maxTimeMs }).economy,
	).toBe(paid)
	expect(TREASURY_BUDGET.get({ state, p: nation }).titleCreationExpenses).toBe(
		0,
	)
	state.time += STATE.yearMs / 2
	JOURNAL.flush({
		state,
		noteCursor: state.events.length,
		census: true,
		initial: false,
	})
	const next = state.journal[0].census?.economy
	expect(next?.budgets[index]?.titleCreationExpenses).toBe(0)
	expect(covering?.budgets[index]?.titleCreationExpenses).toBe(-625 / 36)
})

it("charges founding through succession and overthrow", () => {
	const succession = fixture(2)
	succession.state.time += STATE.yearMs
	// Whether the realm is partitioned or a district revolts at this succession
	// depends on who inherits in the generated world; the founding charge does
	// not.
	succession.state.governmentType[succession.nation] =
		GOVERNMENT.getGovIdx().feudal_monarchy
	const rebel = vi.spyOn(WAR, "rebel").mockReturnValue(false)
	PERSON_DEATH.kill({
		state: succession.state,
		person: succession.state.people.rulerOf[succession.nation],
		cause: "natural",
		rng: succession.rng,
	})
	rebel.mockRestore()
	expect(
		succession.state.events.filter((note) => note.tag === "title created"),
	).toHaveLength(1)
	expect(
		TREASURY_BUDGET.get({ state: succession.state, p: succession.nation })
			.titleCreationExpenses,
	).toBe(-625 / 36)
	const { state, nation, rng, provinces } = fixture(2)
	const attacker = provinces.find(
		(p) => p !== nation && state.people.rulerOf[p] >= 0,
	)
	if (attacker === undefined) throw new Error("no claimant")
	const claimant = state.people.rulerOf[attacker]
	const deposed = state.people.rulerOf[nation]
	const war = STATE.createActiveWar({ state, attacker, defender: nation, rng })
	OVERTHROW.enthrone({ state, war, claimant, claim: 3, deposed, rng })
	expect(
		state.events.filter((note) => note.tag === "title created"),
	).toHaveLength(1)
	expect(TREASURY_BUDGET.get({ state, p: nation }).titleCreationExpenses).toBe(
		-625 / 36,
	)
})
