import { beforeAll, describe, expect, it, vi } from "vitest"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import { RAID } from "@/model/history/sim/engine/events/raid"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { MILITARY } from "@/model/history/sim/engine/military"
import { DEPLOYMENTS } from "@/model/history/sim/engine/military/deployments"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { HISTORY_RUN } from "@/test/history-run"

let state: HistoryState
let nations: number[]
let start: number
let rural: Float32Array
let urban: Float32Array
let governments: Uint8Array

beforeAll(() => {
	state = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	}).engine
	for (const idx of [...state.activeWarIds])
		STATE.resolveWar({
			state,
			war: state.wars[idx],
			transferred: [],
			receiver: state.wars[idx].attacker,
		})
	nations = [...state.militaryIntervals.keys()]
		.sort(
			(a, b) =>
				MILITARY.armySize({ state, nation: b }) -
				MILITARY.armySize({ state, nation: a }),
		)
		.slice(0, 4)
	for (const nation of nations) {
		for (const other of [...state.relationColumns[nation]])
			STATE.setRelation({ state, a: nation, b: other, rel: STATE.rel.NONE })
	}
	rural = state.popRuralCurrent.slice()
	urban = state.popUrbanCurrent.slice()
	governments = state.governmentType.slice()
	start = state.time
}, 120000)

function reset() {
	for (const idx of [...state.activeWarIds])
		STATE.resolveWar({
			state,
			war: state.wars[idx],
			transferred: [],
			receiver: state.wars[idx].attacker,
		})
	state.time = start
	state.popRuralCurrent.set(rural)
	state.popUrbanCurrent.set(urban)
	state.governmentType.set(governments)
	state.realmCache.clear()
	for (const nation of nations)
		for (const other of [...state.relationColumns[nation]])
			STATE.setRelation({ state, a: nation, b: other, rel: STATE.rel.NONE })
	for (const nation of nations) {
		const target = RECRUITMENT.realmTargets({ state, nation })
		state.levyCurrent[nation] = target.levy * 0.5
		state.regularCurrent[nation] = target.regular * 0.5
		state.treasuryCurrent[nation] = 1e9
		const interval = state.militaryIntervals.get(nation)
		if (!interval) throw new Error("missing interval")
		interval.time = start
		interval.pending = { levy: 0, regular: 0 }
		interval.reference = { levy: 0, regular: 0 }
		state.militaryDirty.add(nation)
	}
	MILITARY.reconcile({ state })
}

function advance(years: number) {
	state.time = start + STATE.deltaYear(years)
	MILITARY.advance({ state, nation: nations[0] })
}

function counts() {
	const interval = state.militaryIntervals.get(nations[0])
	if (!interval) throw new Error("missing interval")
	return [
		state.levyCurrent[nations[0]],
		state.regularCurrent[nations[0]],
		interval.pending.levy,
		interval.pending.regular,
	]
}

function war() {
	return STATE.createActiveWar({
		state,
		attacker: nations[0],
		defender: nations[1],
		rng: HISTORY_RNG.createHistoryRng(1),
	})
}

describe("recruitment and integrated military expense", () => {
	it("limits total enrollment without changing the uncapped target composition", () => {
		for (const tribal of [false, true])
			for (const knowledge of [0.42, 1.44, 2.38]) {
				const target = RECRUITMENT.targets({
					population: 1e8,
					tribal,
					knowledge,
					surplus: 1e6,
					outputPerHead: 450,
				})
				const raw = target.uncapped.levy + target.uncapped.regular
				expect(raw).toBeGreaterThan(target.logistics)
				expect(target.levy + target.regular).toBeCloseTo(target.logistics, 7)
				expect(target.levy / target.uncapped.levy).toBeCloseTo(
					target.regular / target.uncapped.regular,
					12,
				)
				const capped = RECRUITMENT.reconcile({
					holdings: target.uncapped,
					targets: target,
				})
				expect(capped.levy).toBeCloseTo(target.levy, 7)
				expect(capped.regular).toBeCloseTo(target.regular, 7)
			}
	})

	it("calculates separate levy and regular targets without converting troops", () => {
		const early = RECRUITMENT.targets({
			population: 1e6,
			tribal: false,
			knowledge: 0.42,
			surplus: (1e6 / 0.75) * ECONOMY.ducatsPerGram,
			outputPerHead: 450,
		})
		const late = RECRUITMENT.targets({
			population: 1e6,
			tribal: false,
			knowledge: 2.38,
			surplus: (5e6 / 0.75) * ECONOMY.ducatsPerGram,
			outputPerHead: 450,
		})
		expect(early.uncapped.regular).toBeCloseTo(500)
		expect(early.levy).toBeCloseTo(20000)
		expect(early.regular).toBeCloseTo(500)
		expect(late.uncapped.regular).toBeCloseTo(22500)
		expect(late.levy).toBeCloseTo(20000)
		expect(late.regular).toBeCloseTo(22500)
		expect(
			RECRUITMENT.targets({
				population: 1e6,
				tribal: false,
				knowledge: 4,
				surplus: 0,
				outputPerHead: 450,
			}).regular,
		).toBe(0)
		expect(
			RECRUITMENT.targets({
				population: 1e6,
				tribal: false,
				knowledge: 4,
				surplus: 1e6,
				outputPerHead: 0,
			}).regular,
		).toBe(0)
	})

	it("scales both requested contributions when the shared budget is insufficient", () => {
		const target = RECRUITMENT.targets({
			population: 1e6,
			tribal: false,
			knowledge: 1,
			surplus: 1 / 0.75,
			outputPerHead: 450,
		})
		expect(target.uncapped.levy).toBe(20000)
		expect(target.uncapped.regular).toBeCloseTo(62.5, 9)
		expect(target.regular).toBeGreaterThan(0)
		expect(target.levy / target.uncapped.levy).toBeCloseTo(
			target.regular / target.uncapped.regular,
			12,
		)
		expect(
			target.levy * target.home.levy + target.regular * target.home.regular,
		).toBeCloseTo(target.budget, 12)
		expect(target.remainingBudget).toBeCloseTo(0, 12)
		expect(target.limits).toEqual({
			budget: true,
			population: false,
			logistics: false,
		})
		const empty = RECRUITMENT.targets({
			population: 1e6,
			tribal: false,
			knowledge: 1,
			surplus: 0,
			outputPerHead: 450,
		})
		expect(empty.levy).toBe(0)
		expect(empty.regular).toBe(0)
	})

	it("preserves requested composition when population safety is the strictest ceiling", () => {
		const target = RECRUITMENT.targets({
			population: 1000,
			tribal: false,
			knowledge: 1,
			surplus: 1e6,
			outputPerHead: 450,
		})
		expect(target.levy + target.regular).toBeCloseTo(100, 9)
		expect(target.levy / target.uncapped.levy).toBeCloseTo(
			target.regular / target.uncapped.regular,
			12,
		)
		expect(target.limits).toEqual({
			budget: false,
			population: true,
			logistics: false,
		})
	})

	it("recovers 10% and 75% of peaceful shortfalls independent of subdivision", () => {
		reset()
		const before = counts()
		advance(1)
		const annual = counts()
		expect(annual[0]).toBeCloseTo(before[0] * 1.1, 8)
		expect(annual[1]).toBeCloseTo(before[1] * 1.75, 8)
		for (const steps of [
			[0.5, 1],
			[0.25, 0.5, 0.75, 1],
			[0.001, 0.17, 0.63, 0.999, 1],
		]) {
			reset()
			for (const time of steps) advance(time)
			counts().forEach((value, index) =>
				expect(value).toBeCloseTo(annual[index], 8),
			)
		}
	})

	it("blocks levy recruitment in war while recruiting regulars and billing campaign soldier-years", () => {
		reset()
		war()
		const before = counts()
		advance(1)
		const annual = counts()
		expect(annual[0]).toBe(before[0])
		expect(annual[1]).toBeGreaterThan(before[1])
		expect(annual[2]).toBeGreaterThan(0)
		const active = state.wars.at(-1)
		if (!active) throw new Error("no war")
		expect(active.deployed[nations[0]].levy).toBeCloseTo(annual[0])
		expect(active.deployed[nations[0]].regular).toBeCloseTo(annual[1])
		MILITARY.validate({ state })
	})

	it("accounts only for peace before joining and after leaving the final war", () => {
		reset()
		const before = counts()
		advance(0.5)
		const first = war()
		const joined = counts()
		const second = STATE.createActiveWar({
			state,
			attacker: nations[0],
			defender: nations[2],
			rng: HISTORY_RNG.createHistoryRng(2),
		})
		advance(0.75)
		STATE.resolveWar({
			state,
			war: first,
			transferred: [],
			receiver: nations[0],
		})
		advance(1)
		expect(counts()[0]).toBeCloseTo(joined[0], 8)
		expect(counts()[0]).toBeGreaterThan(before[0])
		STATE.resolveWar({
			state,
			war: second,
			transferred: [],
			receiver: nations[0],
		})
		advance(1.01)
		expect(counts()[0]).toBeGreaterThan(joined[0])
	})

	it("keeps coalition membership authoritative even with zero troop commitments", () => {
		reset()
		const active = war()
		state.levyCurrent[nations[0]] = 0
		state.regularCurrent[nations[0]] = 0
		state.militaryDirty.add(nations[0])
		MILITARY.reconcile({ state })
		expect(MILITARY.atWar({ state, nation: nations[0] })).toBe(true)
		const journalLength = state.pendingJournal.coalitions.length
		const eventsLength = state.events.length
		const snapshot = counts()
		for (let i = 0; i < 4; i++) {
			MILITARY.atWar({ state, nation: nations[0] })
			MILITARY.threat({ state, attacker: nations[0], defender: nations[1] })
			TAX.previewBudget({ state })
		}
		expect(counts()).toEqual(snapshot)
		expect(state.pendingJournal.coalitions.length).toBe(journalLength)
		expect(state.events.length).toBe(eventsLength)
		expect(active.participants[nations[0]]).toBe("attacker")
	})

	it("settles accrued expense exactly once and preserves expense through peace", () => {
		reset()
		advance(0.2)
		const active = war()
		advance(0.6)
		STATE.resolveWar({
			state,
			war: active,
			transferred: [],
			receiver: nations[0],
		})
		advance(1)
		const expected = counts()[2] + counts()[3]
		TAX.runTax({ state, nation: nations[0], previousTime: start })
		const budget = state.treasuryBudgetCurrent.get(nations[0])
		if (!budget) throw new Error("missing budget")
		expect(budget?.armyExpenses).toBeCloseTo(-expected, 8)
		expect(budget.levyExpenses + budget.regularExpenses).toBeCloseTo(
			-expected,
			8,
		)
		TAX.runTax({ state, nation: nations[0], previousTime: state.time })
		expect(state.treasuryBudgetCurrent.get(nations[0])?.armyExpenses).toBe(0)
		expect(counts().slice(2)).toEqual([0, 0])
	})

	it("gives tribal and steppe governments the same eligibility and shared troop prices", () => {
		const common = {
			population: 1e6,
			knowledge: 1.44,
			surplus: 100 / 0.75,
			outputPerHead: 450,
		}
		const settled = RECRUITMENT.targets({ ...common, tribal: false })
		const tribal = RECRUITMENT.targets({ ...common, tribal: true })
		expect(tribal.levy).toBe(50000)
		expect(settled.levy).toBe(20000)
		expect(tribal.home).toEqual(settled.home)
		expect(tribal.campaign).toEqual(settled.campaign)
		expect(tribal.home.regular).toBeGreaterThan(tribal.home.levy)
		expect(tribal.campaign.regular).toBeGreaterThan(tribal.campaign.levy)
		expect(
			GOVERNMENT.govFamilyOfIndex(GOVERNMENT.getGovIdx().steppe_horde),
		).toBe("tribal")
	})
})

describe("military transitions and conservation", () => {
	it("closes accrued expense before a logistics decrease and trims both commitments", () => {
		reset()
		const nation = nations[0]
		const active = war()
		advance(0.5)
		const before = counts()
		const reference = { ...state.militaryIntervals.get(nation)!.reference }
		const cap = (before[0] + before[1]) * 0.25
		const limit = vi.spyOn(KNOWLEDGE, "maxFieldArmy").mockReturnValue(cap)
		try {
			FIELDS.prov.knowledge.set({
				state,
				p: nation,
				value: state.knowledgeCurrent[nation],
			})
			const target = RECRUITMENT.realmTargets({ state, nation })
			expect(counts()[0]).toBeCloseTo(target.levy, 8)
			expect(counts()[1]).toBeCloseTo(target.regular, 8)
			expect(counts()[0] + counts()[1]).toBeCloseTo(cap, 8)
			expect(counts().slice(2)).toEqual(before.slice(2))
			expect(state.militaryIntervals.get(nation)!.reference).toEqual(reference)
			expect(active.deployed[nation].levy).toBeLessThanOrEqual(counts()[0])
			expect(active.deployed[nation].regular).toBeLessThanOrEqual(counts()[1])
		} finally {
			limit.mockRestore()
		}
		MILITARY.validate({ state })
	})

	it("uses the same field limit for crown and rebel threat", () => {
		reset()
		const overlord = nations.find(
			(nation) => STATE.getChildren({ state, p: nation }).length > 0,
		)
		if (overlord === undefined) throw new Error("missing crown fixture")
		const subject = STATE.getChildren({ state, p: overlord })[0]
		const holdings = {
			levy: state.levyCurrent[overlord],
			regular: state.regularCurrent[overlord],
		}
		const limit = vi.spyOn(KNOWLEDGE, "maxFieldArmy").mockReturnValue(1)
		try {
			state.levyCurrent[overlord] = 1e8
			state.regularCurrent[overlord] = 1e8
			expect(MILITARY.rebellionThreat({ state, overlord, subject })).toBe(0.5)
		} finally {
			limit.mockRestore()
			state.levyCurrent[overlord] = holdings.levy
			state.regularCurrent[overlord] = holdings.regular
		}
	})

	it("rejects individual nonfinite and negative commitments", () => {
		reset()
		const active = war()
		const nation = nations[0]
		const before = { ...active.deployed[nation] }
		try {
			for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
				active.deployed[nation].levy = invalid
				expect(() => MILITARY.validate({ state })).toThrow("commitment")
			}
		} finally {
			active.deployed[nation] = before
		}
	})

	it("uses retained loss pressure to turn the same controlled battle into a rout", () => {
		const outcomes: string[] = []
		for (const depleted of [false, true]) {
			reset()
			const nation = nations[0]
			state.levyCurrent[nation] = depleted ? 800 : 400
			state.regularCurrent[nation] = depleted ? 200 : 100
			state.levyCurrent[nations[1]] = 400
			state.regularCurrent[nations[1]] = 100
			state.militaryDirty.add(nation)
			state.militaryDirty.add(nations[1])
			const active = war()
			if (depleted)
				MILITARY.applyLosses({
					state,
					war: active,
					members: [{ nation, force: 1000, levy: 800, regular: 200 }],
					losses: 500,
				})
			const rng = HISTORY_RNG.createHistoryRng(9)
			const rolls = [0.2, 0.03]
			rng.random = () => rolls.shift() ?? 0.5
			const result = MILITARY.fight({
				state,
				war: active,
				eventAttacker: nation,
				attackerMultiplier: 1,
				defenderMultiplier: 1,
				rng,
			})
			expect(result.attackerArmy).toBeCloseTo(500, 8)
			expect(result.defenderArmy).toBeCloseTo(500, 8)
			expect(result.loserShortfall).toBe(depleted ? 0.5 : 0)
			outcomes.push(result.outcome)
		}
		expect(outcomes).toEqual(["normal", "rout"])
	})

	it("preserves wartime commitments and expenses under irregular advancement", () => {
		reset()
		let active = war()
		advance(1)
		const annual = [...counts(), ...Object.values(active.deployed[nations[0]])]
		reset()
		active = war()
		for (const time of [0.001, 0.17, 0.63, 0.999, 1]) advance(time)
		const split = [...counts(), ...Object.values(active.deployed[nations[0]])]
		split.forEach((value, index) => expect(value).toBeCloseTo(annual[index], 8))
	})

	it("charges the same mixed peace and campaign expense under split settlements", () => {
		const expenses: number[] = []
		const finalCounts: number[][] = []
		for (const split of [false, true]) {
			reset()
			let charged = 0
			advance(0.2)
			const active = war()
			advance(0.5)
			MILITARY.applyLosses({
				state,
				war: active,
				members: [
					{
						nation: nations[0],
						force: MILITARY.armySize({ state, nation: nations[0] }),
						levy: state.levyCurrent[nations[0]],
						regular: state.regularCurrent[nations[0]],
					},
				],
				losses: 100,
			})
			if (split) {
				const settled = RECRUITMENT.settle({ state, nation: nations[0] })
				charged += settled.levy + settled.regular
			}
			advance(0.7)
			STATE.resolveWar({
				state,
				war: active,
				transferred: [],
				receiver: nations[0],
			})
			advance(1)
			const settled = RECRUITMENT.settle({ state, nation: nations[0] })
			charged += settled.levy + settled.regular
			expenses.push(charged)
			finalCounts.push(counts())
		}
		expect(expenses[1]).toBeCloseTo(expenses[0], 8)
		finalCounts[1].forEach((value, index) =>
			expect(value).toBeCloseTo(finalCounts[0][index], 8),
		)
	})

	it("removes uncommitted excess before trimming wartime commitments", () => {
		reset()
		const nation = nations[0]
		const active = war()
		const commitment = state.levyCurrent[nation] * 0.2
		active.deployed[nation].levy = commitment
		const reference = { ...state.militaryIntervals.get(nation)!.reference }
		MILITARY.mutate({
			state,
			action: () => {
				for (const p of STATE.getNationProvinces({ state, root: nation })) {
					FIELDS.prov.population.rural.set({
						state,
						p,
						value: state.popRuralCurrent[p] * 0.4,
					})
					FIELDS.prov.population.urban.set({
						state,
						p,
						value: state.popUrbanCurrent[p] * 0.4,
					})
				}
			},
		})
		expect(active.deployed[nation].levy).toBeCloseTo(commitment, 8)
		expect(state.militaryIntervals.get(nation)!.reference).toEqual(reference)
		expect(state.levyCurrent[nation]).toBeGreaterThan(commitment)
		MILITARY.validate({ state })
	})

	it("does not credit target growth or casualties with earlier recovery", () => {
		reset()
		const nation = nations[0]
		advance(0.5)
		const before = counts()
		FIELDS.prov.government.set({
			state,
			p: nation,
			value: GOVERNMENT.getGovIdx().chiefdom,
		})
		expect(counts()[0]).toBe(before[0])
		expect(counts()[1]).toBeLessThanOrEqual(before[1])
		expect(counts().slice(2)).toEqual(before.slice(2))
		const interval = state.militaryIntervals.get(nation)!
		expect(interval.targets.levy).toBeGreaterThan(before[0])
		advance(1)
		expect(counts()[0]).toBeGreaterThan(before[0])
		expect(counts()[0]).toBeLessThan(interval.targets.levy)
	})

	it("reuses readiness across wars for one pass and reevaluates it on the next pass", () => {
		reset()
		const ally = nations[3]
		for (const defender of [nations[1], nations[2]]) {
			STATE.setRelation({ state, a: defender, b: ally, rel: STATE.rel.ALLY })
			STATE.setDisposition({
				state,
				a: defender,
				b: ally,
				disposition: STATE.disp.TRUSTED,
			})
		}
		const first = war()
		const second = STATE.createActiveWar({
			state,
			attacker: nations[0],
			defender: nations[2],
			rng: HISTORY_RNG.createHistoryRng(23),
		})
		DEPLOYMENTS.touchedWars({ state, nations: new Set() })
		const wars = new Set(state.activeWarIds)
		const targets = vi.spyOn(RECRUITMENT, "realmTargets")
		try {
			const participants = [first.participants, second.participants]
			expect(DEPLOYMENTS.reconcileParticipation({ state, wars }).size).toBe(0)
			expect(first.participants).toBe(participants[0])
			expect(second.participants).toBe(participants[1])
			expect(first.participants[ally]).toBe("defender")
			expect(second.participants[ally]).toBe("defender")
			expect(
				targets.mock.calls.filter(([params]) => params.nation === ally),
			).toHaveLength(1)
			state.treasuryCurrent[ally] = -1e9
			targets.mockClear()
			expect(
				DEPLOYMENTS.reconcileParticipation({ state, wars }).has(ally),
			).toBe(true)
			expect(first.participants[ally]).toBeUndefined()
			expect(second.participants[ally]).toBeUndefined()
			expect(
				targets.mock.calls.filter(([params]) => params.nation === ally),
			).toHaveLength(1)
		} finally {
			targets.mockRestore()
		}
	})

	it("blocks allied recovery and records disposition-driven exits before any coalition read", () => {
		reset()
		const ally = nations[2]
		STATE.setRelation({ state, a: nations[1], b: ally, rel: STATE.rel.ALLY })
		const active = war()
		expect(active.participants[ally]).toBe("defender")
		const before = state.levyCurrent[ally]
		state.time = start + STATE.deltaYear(0.5)
		MILITARY.reconcile({ state })
		expect(state.levyCurrent[ally]).toBe(before)
		STATE.setDisposition({
			state,
			a: nations[1],
			b: ally,
			disposition: STATE.disp.RIVAL,
		})
		expect(active.participants[ally]).toBeUndefined()
		state.time = start + STATE.deltaYear(0.75)
		MILITARY.advance({ state, nation: ally })
		expect(state.levyCurrent[ally]).toBeGreaterThan(before)
		STATE.setDisposition({
			state,
			a: nations[1],
			b: ally,
			disposition: STATE.disp.TRUSTED,
		})
		expect(active.participants[ally]).toBe("defender")
	})

	it("applies vassal obligations, union links, and backer membership at the mutation timestamp", () => {
		reset()
		const supporter = nations[2]
		STATE.setRelation({
			state,
			a: supporter,
			b: nations[0],
			rel: STATE.rel.VASSAL,
		})
		const active = war()
		expect(active.participants[supporter]).toBe("attacker")
		STATE.setDisposition({
			state,
			a: nations[0],
			b: supporter,
			disposition: STATE.disp.SUSPICIOUS,
		})
		expect(active.participants[supporter]).toBeUndefined()
		STATE.setRelation({
			state,
			a: supporter,
			b: nations[0],
			rel: STATE.rel.PU_SENIOR,
		})
		expect(active.participants[supporter]).toBe("attacker")
		STATE.setRelation({
			state,
			a: supporter,
			b: nations[0],
			rel: STATE.rel.NONE,
		})
		expect(active.participants[supporter]).toBeUndefined()
		MILITARY.mutate({
			state,
			action: () => {
				active.goal = "throne"
				active.backers.push(supporter)
				state.militaryDiplomacyDirty = true
				state.militaryDiplomacyNations.add(active.attacker)
			},
		})
		expect(active.participants[supporter]).toBe("attacker")
		const before = state.levyCurrent[supporter]
		state.time = start + STATE.deltaYear(0.1)
		MILITARY.reconcile({ state })
		expect(state.levyCurrent[supporter]).toBe(before)
		MILITARY.mutate({
			state,
			action: () => {
				active.backers.length = 0
				state.militaryDiplomacyDirty = true
				state.militaryDiplomacyNations.add(active.attacker)
			},
		})
		expect(active.participants[supporter]).toBeUndefined()
	})

	it("uses pending upkeep for fiscal exhaustion and retains debt only for existing supporters", () => {
		reset()
		const ally = nations[2]
		STATE.setRelation({ state, a: nations[1], b: ally, rel: STATE.rel.ALLY })
		const active = war()
		const surplus = ECONOMY.surplus({ state, p: ally })
		FIELDS.prov.treasury.set({ state, p: ally, value: -0.1 * surplus })
		expect(active.participants[ally]).toBe("defender")
		const interval = state.militaryIntervals.get(ally)!
		interval.pending = { levy: surplus, regular: 0 }
		state.militaryDirty.add(ally)
		MILITARY.reconcile({ state })
		expect(active.participants[ally]).toBeUndefined()
		interval.pending = { levy: 0, regular: 0 }
		FIELDS.prov.treasury.set({ state, p: ally, value: -0.1 * surplus })
		expect(active.participants[ally]).toBeUndefined()
		FIELDS.prov.treasury.set({ state, p: ally, value: surplus })
		expect(active.participants[ally]).toBe("defender")
	})

	it("retains a 1000-soldier rout reference after proportional production casualties", () => {
		reset()
		const nation = nations[0]
		state.levyCurrent[nation] = 800
		state.regularCurrent[nation] = 200
		state.militaryDirty.add(nation)
		const active = war()
		const interval = state.militaryIntervals.get(nation)!
		expect(interval.reference).toEqual({ levy: 800, regular: 200 })
		const ruralBefore = STATE.getNationPopulation({ state, root: nation })
		MILITARY.applyLosses({
			state,
			war: active,
			members: [{ nation, force: 1000, levy: 800, regular: 200 }],
			losses: 500,
		})
		expect(state.levyCurrent[nation]).toBeCloseTo(400, 8)
		expect(state.regularCurrent[nation]).toBeCloseTo(100, 8)
		expect(
			active.deployed[nation].levy + active.deployed[nation].regular,
		).toBeCloseTo(500, 8)
		expect(interval.reference).toEqual({ levy: 800, regular: 200 })
		expect(
			ruralBefore - STATE.getNationPopulation({ state, root: nation }),
		).toBeCloseTo(500, 0)
		for (let i = 0; i < 3; i++) MILITARY.reconcile({ state })
		const rng = HISTORY_RNG.createHistoryRng(8)
		rng.random = () => 0.01
		const result = MILITARY.fight({
			state,
			war: active,
			eventAttacker: nation,
			attackerMultiplier: 1,
			defenderMultiplier: 1,
			rng,
		})
		expect(result.attackerWon).toBe(false)
		expect(result.loserShortfall).toBeCloseTo(0.5, 8)
		expect(0.2 * result.loserShortfall).toBeCloseTo(0.1, 8)
		expect(interval.reference).toEqual({ levy: 800, regular: 200 })
		STATE.resolveWar({ state, war: active, transferred: [], receiver: nation })
		expect(interval.reference).toEqual({ levy: 0, regular: 0 })
		const surviving = {
			levy: state.levyCurrent[nation],
			regular: state.regularCurrent[nation],
		}
		war()
		expect(interval.reference).toEqual(surviving)
	})

	it("closes old inputs before price/target changes and demobilizes without population credit", () => {
		reset()
		const nation = nations[0]
		const active = war()
		advance(0.5)
		const expense = counts().slice(2)
		const population = STATE.getNationPopulation({ state, root: nation })
		MILITARY.mutate({
			state,
			action: () => {
				for (const p of STATE.getNationProvinces({ state, root: nation })) {
					FIELDS.prov.population.rural.set({
						state,
						p,
						value: state.popRuralCurrent[p] * 0.05,
					})
					FIELDS.prov.population.urban.set({
						state,
						p,
						value: state.popUrbanCurrent[p] * 0.05,
					})
				}
			},
		})
		expect(counts().slice(2)).toEqual(expense)
		expect(MILITARY.atWar({ state, nation })).toBe(true)
		const target = RECRUITMENT.realmTargets({ state, nation })
		expect(state.levyCurrent[nation]).toBeLessThanOrEqual(target.levy)
		expect(state.regularCurrent[nation]).toBeLessThanOrEqual(target.regular)
		expect(STATE.getNationPopulation({ state, root: nation })).toBeCloseTo(
			population * 0.05,
			0,
		)
		expect(
			state.militaryIntervals.get(nation)!.demobilized.levy,
		).toBeGreaterThan(0)
		expect(active.deployed[nation].levy).toBeLessThanOrEqual(
			state.levyCurrent[nation],
		)
		MILITARY.validate({ state })
		const overflow = RECRUITMENT.reconcile({
			holdings: { levy: 90, regular: 50 },
			targets: { ...target, levy: 90, regular: 50, safety: 100 },
		})
		expect(overflow.levy).toBeCloseTo((90 * 100) / 140, 9)
		expect(overflow.regular).toBeCloseTo((50 * 100) / 140, 9)
	})

	it("uses identical fiscal, exhaustion, loot, and peace demands for every government family", () => {
		reset()
		const nation = nations[0]
		const victim = nations[1]
		const active = war()
		const province = STATE.getNationProvinces({ state, root: victim })[0]
		const prices: number[] = []
		const revenue: number[] = []
		const asks: number[] = []
		for (const government of [
			GOVERNMENT.getGovIdx().feudal_monarchy,
			GOVERNMENT.getGovIdx().chiefdom,
			GOVERNMENT.getGovIdx().steppe_horde,
			GOVERNMENT.getGovIdx().oligarchic_republic,
			GOVERNMENT.getGovIdx().theocracy,
		]) {
			state.governmentType[nation] = government
			state.realmCache.clear()
			prices.push(RECRUITMENT.realmTargets({ state, nation }).campaign.regular)
			revenue.push(ECONOMY.revenue({ state, p: nation }))
			state.plunderedUntil[province] = 0
			const output = ECONOMY.provinceOutput({ state, p: province })
			const loot = MILITARY.plunder({
				state,
				raider: nation,
				loser: victim,
				province,
				sack: false,
			})
			expect(loot).toBeCloseTo((0.03 * output) / 3, 8)
			expect(MILITARY.exhausted({ state, nation })).toBe(false)
			asks.push(PEACE.buyoff({ state, war: active }))
		}
		expect(new Set(prices).size).toBe(1)
		expect(new Set(revenue).size).toBe(1)
		expect(new Set(asks).size).toBe(1)
	})

	it("charges an undiscounted positive peace buyoff under every government", () => {
		reset()
		const active = war()
		active.occupied = [nations[1]]
		const threat = vi.spyOn(MILITARY, "threat").mockReturnValue(0.001)
		try {
			const asks: number[] = []
			for (const government of [
				GOVERNMENT.getGovIdx().feudal_monarchy,
				GOVERNMENT.getGovIdx().chiefdom,
				GOVERNMENT.getGovIdx().steppe_horde,
				GOVERNMENT.getGovIdx().oligarchic_republic,
				GOVERNMENT.getGovIdx().theocracy,
			]) {
				state.governmentType[nations[1]] = government
				state.realmCache.clear()
				asks.push(PEACE.buyoff({ state, war: active }))
			}
			expect(asks[0]).toBeGreaterThan(0)
			expect(new Set(asks).size).toBe(1)
			expect(asks[0]).toBeCloseTo(
				0.999 * 20 * ECONOMY.revenue({ state, p: nations[1] }),
				8,
			)
		} finally {
			threat.mockRestore()
		}
	})

	it("allows chiefdom and steppe raids while blocking every nontribal family", () => {
		for (const government of [
			GOVERNMENT.getGovIdx().feudal_monarchy,
			GOVERNMENT.getGovIdx().chiefdom,
			GOVERNMENT.getGovIdx().steppe_horde,
			GOVERNMENT.getGovIdx().oligarchic_republic,
			GOVERNMENT.getGovIdx().theocracy,
		]) {
			reset()
			state.truces.clear()
			state.plunderedUntil.fill(0)
			const nation = nations[0]
			const before = counts().slice(0, 2)
			FIELDS.prov.government.set({ state, p: nation, value: government })
			expect(state.levyCurrent[nation]).toBeLessThanOrEqual(before[0])
			expect(state.regularCurrent[nation]).toBeLessThanOrEqual(before[1])
			const raids = state.events.filter((note) => note.tag === "raid").length
			const rng = HISTORY_RNG.createHistoryRng(13)
			rng.random = () => 0
			RAID.runRaid({ state, nation, rng })
			const tribal = GOVERNMENT.govFamilyOfIndex(government) === "tribal"
			expect(
				state.events.filter((note) => note.tag === "raid").length - raids,
			).toBe(tribal ? 1 : 0)
		}
	})

	it("preserves troops on succession and disbands an annexed army without transferring it", () => {
		const { engine } = HISTORY_RUN.createEngine({
			seed: 14963991,
			era: "lateMedieval",
			numPoints: 30000,
		})
		for (const idx of [...engine.activeWarIds])
			STATE.resolveWar({
				state: engine,
				war: engine.wars[idx],
				transferred: [],
				receiver: engine.wars[idx].attacker,
			})
		const roots = [...engine.militaryIntervals.keys()].filter((nation) =>
			STATE.isSovereign({ state: engine, p: nation }),
		)
		const [victor, defeated] = roots
		const enrolled = {
			levy: engine.levyCurrent[victor],
			regular: engine.regularCurrent[victor],
		}
		STATE.foundRuler({
			state: engine,
			p: victor,
			age: 30,
			claim: 3,
			rng: HISTORY_RNG.createHistoryRng(12),
			reason: "succession",
		})
		expect(engine.levyCurrent[victor]).toBe(enrolled.levy)
		expect(engine.regularCurrent[victor]).toBe(enrolled.regular)
		const before = { ...engine.militaryTotals.demobilized }
		const defeatedTroops = {
			levy: engine.levyCurrent[defeated],
			regular: engine.regularCurrent[defeated],
		}
		STATE.repartitionNation({
			state: engine,
			nation: victor,
			subjects: STATE.getNationProvinces({ state: engine, root: defeated }),
		})
		expect(engine.levyCurrent[defeated]).toBe(0)
		expect(engine.regularCurrent[defeated]).toBe(0)
		expect(engine.levyCurrent[victor]).toBeLessThanOrEqual(enrolled.levy)
		expect(engine.regularCurrent[victor]).toBeLessThanOrEqual(enrolled.regular)
		expect(
			engine.militaryTotals.demobilized.levy - before.levy,
		).toBeGreaterThanOrEqual(defeatedTroops.levy)
		expect(
			engine.militaryTotals.demobilized.regular - before.regular,
		).toBeGreaterThanOrEqual(defeatedTroops.regular - 1e-9)
		MILITARY.validate({ state: engine })
	}, 120000)
})
