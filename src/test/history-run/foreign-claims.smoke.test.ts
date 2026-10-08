import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { CONQUEST } from "@/model/history/sim/engine/events/battle/conquest"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import { TRUCE } from "@/model/history/sim/engine/events/peace/truce"
import { OVERTHROW } from "@/model/history/sim/engine/events/succession/overthrow"
import { WAR } from "@/model/history/sim/engine/events/war"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { HISTORY_RUN } from "@/test/history-run"
import { HISTORY_VALIDATION } from "@/test/history-run/report/validation"

let state: HistoryState
let attacker: number
let defender: number
let claimant: number

function endWars(): void {
	for (const idx of [...state.activeWarIds])
		STATE.resolveWar({
			state,
			war: state.wars[idx],
			transferred: [],
			receiver: state.wars[idx].attacker,
		})
}

function declare(): War {
	return STATE.createActiveWar({
		state,
		attacker,
		defender,
		rng: HISTORY_RNG.createHistoryRng(5),
		options: { goal: "claim", claimant },
	})
}

function occupyCapital(war: War): void {
	FIELDS.prov.occupation.set({ state, p: defender, value: war.idx })
	war.occupied.push(defender)
}

beforeAll(() => {
	state = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	}).engine
	endWars()
	const free = (p: number) =>
		!state.desolate[p] &&
		STATE.isSovereign({ state, p }) &&
		state.people.rulerOf[p] >= 0 &&
		!STATE.getRulerRelation({ state, nation: p })
	const pair = Array.from({ length: state.P }, (_, p) => p)
		.filter(free)
		.flatMap((p) =>
			STATE.getNationNeighbors({ state, nation: p })
				.filter(
					(nb) =>
						nb > p &&
						free(nb) &&
						STATE.getRelation({ state, a: p, b: nb }) === STATE.rel.NONE,
				)
				.map((nb) => [p, nb]),
		)[0]
	if (!pair) throw new Error("no neighbouring pair")
	;[attacker, defender] = pair
	for (const p of pair)
		state.governmentType[p] = GOVERNMENT.getGovIdx().feudal_monarchy
	claimant = state.people.rulerOf[attacker]
}, 120000)

afterEach(() => {
	vi.restoreAllMocks()
	endWars()
	STATE.setRelation({ state, a: attacker, b: defender, rel: STATE.rel.NONE })
	state.truces.clear()
	state.governmentType[defender] = GOVERNMENT.getGovIdx().feudal_monarchy
})

describe("claim wars", () => {
	it("are interstate wars that record the person they press", () => {
		const war = declare()
		expect(STATE.isRebelGoal({ goal: war.goal })).toBe(false)
		expect(STATE.warSides({ war })).toEqual({ rebels: -1, crown: -1 })
		expect(war.claimant).toBe(claimant)
		expect(war.originalCrownRuler).toBe(state.people.rulerOf[defender])
		expect(OVERTHROW.stands({ state, war })).toBe(true)
		expect(PEACE.buyoff({ state, war })).toBe(0)
		occupyCapital(war)
		expect(
			PEACE.negotiate({
				state,
				war,
				rng: HISTORY_RNG.createHistoryRng(1),
				stalled: false,
			}),
		).toBe(false)
	})

	it("bind a foreign claimant at war so that it inherits nowhere else", () => {
		declare()
		expect(STATE.isPressing({ state, p: attacker })).toBe(true)
	})
})

describe("pressing a claim", () => {
	it("starts nothing against a realm that is not a viable target", () => {
		const far = Array.from({ length: state.P }, (_, p) => p).find(
			(p) =>
				p !== attacker &&
				p !== defender &&
				!state.desolate[p] &&
				STATE.isSovereign({ state, p }) &&
				!STATE.getNationNeighbors({ state, nation: attacker }).includes(p),
		)
		if (far === undefined) throw new Error("no distant realm")
		const before = state.wars.length
		WAR.pressClaim({
			state,
			attacker,
			defender: far,
			claimant,
			rng: HISTORY_RNG.createHistoryRng(2),
		})
		expect(state.wars.length).toBe(before)
	})

	it("declares a claim war on a neighbour the realm would attack for land", () => {
		vi.spyOn(MILITARY, "threat").mockReturnValue(0)
		const rng = HISTORY_RNG.createHistoryRng(2)
		rng.random = () => 0
		const before = state.wars.length
		WAR.pressClaim({ state, attacker, defender, claimant, rng })
		expect(state.wars.length).toBe(before + 1)
		const war = state.wars[before]
		expect(war.goal).toBe("claim")
		expect(war.claimant).toBe(claimant)
	})
})

describe("the end of a claim war", () => {
	it("ends in a union without moving land or signing a truce when the capital is held", () => {
		const war = declare()
		occupyCapital(war)
		const owners = Array.from(state.sovereignCurrent)
		const result = PEACE.conclude({
			state,
			war,
			reason: "both exhausted",
			rng: HISTORY_RNG.createHistoryRng(9),
		})
		expect(result.outcome).toBe("union")
		expect(Array.from(state.sovereignCurrent)).toEqual(owners)
		expect(state.people.rulerOf[defender]).toBe(claimant)
		expect(state.people.rulerOf[attacker]).toBe(claimant)
		expect(STATE.unionSenior({ state, p: attacker })).toBe(
			STATE.unionSenior({ state, p: defender }),
		)
		expect(TRUCE.active({ state, a: attacker, b: defender })).toBe(false)
		const tracker = HISTORY_VALIDATION.tracker()
		HISTORY_VALIDATION.unions({ engine: state, tracker })
		expect(tracker.violations).toEqual({})
	})

	it("lapses when the claim stops standing, leaving rulers and land alone", () => {
		const war = declare()
		occupyCapital(war)
		state.governmentType[defender] = GOVERNMENT.getGovIdx().elective_monarchy
		const rulers = [
			state.people.rulerOf[attacker],
			state.people.rulerOf[defender],
		]
		expect(
			CONQUEST.settle({ state, war, rng: HISTORY_RNG.createHistoryRng(4) }),
		).toBe(true)
		const ended = state.events.filter((note) => note.tag === "war ended").at(-1)
		expect(ended?.data.outcome).toBe("lapsed")
		expect(ended?.data.reason).toBe("claim lapsed")
		expect(ended?.data.winner).toBe(defender)
		expect([
			state.people.rulerOf[attacker],
			state.people.rulerOf[defender],
		]).toEqual(rulers)
		expect(TRUCE.active({ state, a: attacker, b: defender })).toBe(true)
	})

	it("hands occupied land back and makes a white peace on a won score without the capital", () => {
		const war = declare()
		const land = STATE.getNationProvinces({ state, root: defender }).find(
			(p) => p !== defender,
		)
		if (land !== undefined) {
			FIELDS.prov.occupation.set({ state, p: land, value: war.idx })
			war.occupied.push(land)
		}
		war.battleScore = 60
		const terms = PEACE.terms({ state, war, reason: "both exhausted" })
		expect(terms.outcome).toBe("white peace")
		expect(terms.transferred).toEqual([])
	})
})
