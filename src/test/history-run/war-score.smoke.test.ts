import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ECONOMY } from "@/model/history/sim/engine/economy"
import { CONQUEST } from "@/model/history/sim/engine/events/battle/conquest"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import { WAR_SCORE } from "@/model/history/sim/engine/events/war/score"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import { HISTORY_RUN } from "@/test/history-run"

let state: HistoryState
let defender: number
let seat: number
let nested: number
let attackers: number[]

function endWars(): void {
	for (const idx of [...state.activeWarIds])
		STATE.resolveWar({
			state,
			war: state.wars[idx],
			transferred: [],
			receiver: state.wars[idx].attacker,
		})
}

function declare(attacker: number): War {
	return STATE.createActiveWar({
		state,
		attacker,
		defender,
		rng: HISTORY_RNG.createHistoryRng(7),
	})
}

function occupy(war: War, p: number): void {
	FIELDS.prov.occupation.set({ state, p, value: war.idx })
	if (!war.occupied.includes(p)) war.occupied.push(p)
}

function output(provinces: number[]): number {
	return provinces.reduce(
		(sum, p) => sum + ECONOMY.provinceOutput({ state, p }),
		0,
	)
}

function landShare(provinces: number[]): number {
	const realm = STATE.getNationProvinces({ state, root: defender })
	return (
		output(provinces.filter((p) => p !== defender)) /
		output(realm.filter((p) => p !== defender))
	)
}

function rolls(values: number[]) {
	const rng = HISTORY_RNG.createHistoryRng(11)
	let i = 0
	rng.random = () => values[i++] ?? 0.99
	return rng
}

// Sets the battle part so the whole score lands on the wanted value.
function scoreAt(war: War, score: number): void {
	war.battleScore = 0
	war.battleScore = score - WAR_SCORE.current({ state, war }).score
}

beforeAll(() => {
	state = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	}).engine
	endWars()
	const sovereigns = Array.from({ length: state.P }, (_, p) => p).filter(
		(p) => !state.desolate[p] && STATE.isSovereign({ state, p }),
	)
	const found = sovereigns.find((p) => {
		const children = STATE.getChildren({ state, p })
		return (
			children.length >= 2 &&
			children.some((c) => STATE.getChildren({ state, p: c }).length > 0)
		)
	})
	if (found === undefined) throw new Error("no nested realm")
	defender = found
	seat = STATE.getChildren({ state, p: defender }).find(
		(c) => STATE.getChildren({ state, p: c }).length > 0,
	)!
	nested = STATE.getChildren({ state, p: seat })[0]
	attackers = sovereigns.filter((p) => p !== defender).slice(0, 2)
}, 120000)

afterEach(() => {
	vi.restoreAllMocks()
	endWars()
})

describe("war score parts", () => {
	it("starts at zero and moves the battle part toward the winner within its caps", () => {
		const war = declare(attackers[0])
		expect(WAR_SCORE.current({ state, war })).toEqual({
			battles: 0,
			land: 0,
			capital: 0,
			score: 0,
		})
		WAR_SCORE.battle({ war, winner: war.attacker, loserLossShare: 0.2 })
		expect(war.battleScore).toBeCloseTo(10, 10)
		WAR_SCORE.battle({ war, winner: war.defender, loserLossShare: 0.3 })
		expect(war.battleScore).toBeCloseTo(-5, 10)
		for (let i = 0; i < 3; i++)
			WAR_SCORE.battle({ war, winner: war.attacker, loserLossShare: 1 })
		expect(war.battleScore).toBe(50)
		for (let i = 0; i < 4; i++)
			WAR_SCORE.battle({ war, winner: war.defender, loserLossShare: 1 })
		expect(war.battleScore).toBe(-100)
		expect(WAR_SCORE.current({ state, war }).score).toBe(-100)
	})

	it("counts a held seat with its district as land by output share", () => {
		const war = declare(attackers[0])
		occupy(war, seat)
		const district = STATE.getNationProvinces({ state, root: seat })
		expect([...STATE.occupiedLand({ state, war })].sort()).toEqual(
			[...district].sort(),
		)
		const score = WAR_SCORE.current({ state, war })
		expect(score.land).toBeCloseTo(50 * landShare(district), 8)
		expect(score.capital).toBe(0)
		expect(score.score).toBeCloseTo(score.land, 10)
	})

	it("gives the capital 50 and lets the root cover only itself", () => {
		const war = declare(attackers[0])
		occupy(war, defender)
		expect(STATE.occupiedLand({ state, war })).toEqual([defender])
		expect(WAR_SCORE.current({ state, war })).toEqual({
			battles: 0,
			land: 0,
			capital: 50,
			score: 50,
		})
	})

	it("reads 100 once every province is occupied, whatever the battles say", () => {
		const war = declare(attackers[0])
		occupy(war, defender)
		for (const child of STATE.getChildren({ state, p: defender }))
			occupy(war, child)
		war.battleScore = -60
		const score = WAR_SCORE.current({ state, war })
		expect(score.battles).toBe(-60)
		expect(score.score).toBe(100)
		FIELDS.prov.occupation.set({ state, p: seat, value: -1 })
		expect(WAR_SCORE.current({ state, war }).score).toBeLessThan(100)
	})

	it("marks a seeded occupation of the root", () => {
		const war = STATE.createActiveWar({
			state,
			attacker: attackers[0],
			defender,
			rng: HISTORY_RNG.createHistoryRng(7),
			options: { occupied: [defender] },
		})
		expect(state.occupationCurrent[defender]).toBe(war.idx)
		expect(WAR_SCORE.current({ state, war }).capital).toBe(50)
	})
})

describe("cover between wars", () => {
	it("moves a seat to the war that took it last, though the first still lists it", () => {
		const first = declare(attackers[0])
		const second = declare(attackers[1])
		occupy(first, seat)
		occupy(second, seat)
		expect(first.occupied).toContain(seat)
		expect(STATE.occupiedLand({ state, war: first })).toEqual([])
		expect(WAR_SCORE.current({ state, war: first }).land).toBe(0)
		expect(STATE.occupiedLand({ state, war: second })).toContain(seat)
	})

	it("splits a district when another war takes a child, and returns it when the mark is cleared", () => {
		const first = declare(attackers[0])
		const second = declare(attackers[1])
		occupy(first, seat)
		occupy(second, nested)
		const taken = STATE.getNationProvinces({ state, root: nested })
		const mine = STATE.occupiedLand({ state, war: first })
		const theirs = STATE.occupiedLand({ state, war: second })
		expect([...theirs].sort()).toEqual([...taken].sort())
		expect(mine.some((p) => theirs.includes(p))).toBe(false)
		expect(mine).toContain(seat)
		FIELDS.prov.occupation.set({ state, p: nested, value: -1 })
		expect(STATE.occupiedLand({ state, war: first })).toContain(nested)
		expect(STATE.occupiedLand({ state, war: second })).toEqual([])
	})
})

describe("endings and terms", () => {
	it("settles the war at either end of the scale", () => {
		const conclude = vi
			.spyOn(PEACE, "conclude")
			.mockReturnValue(undefined as never)
		const rng = rolls([])
		const war = declare(attackers[0])
		expect(CONQUEST.settle({ state, war, rng })).toBe(false)
		war.battleScore = -100
		expect(CONQUEST.settle({ state, war, rng })).toBe(true)
		expect(conclude).toHaveBeenLastCalledWith(
			expect.objectContaining({ reason: "defended" }),
		)
		occupy(war, defender)
		war.battleScore = 50
		expect(CONQUEST.settle({ state, war, rng })).toBe(true)
		expect(conclude).toHaveBeenLastCalledWith(
			expect.objectContaining({ reason: "enforced" }),
		)
	})

	it("takes the whole realm when the capital is held at any ending and offers no buy-off", () => {
		const war = declare(attackers[0])
		occupy(war, defender)
		const terms = PEACE.terms({ state, war, reason: "both exhausted" })
		expect(terms.outcome).toBe("annexation")
		expect([...terms.transferred].sort()).toEqual(
			[...STATE.getNationProvinces({ state, root: defender })].sort(),
		)
		expect(PEACE.buyoff({ state, war })).toBe(0)
	})

	it("cedes occupied land only on a positive score", () => {
		const war = declare(attackers[0])
		occupy(war, seat)
		const held = PEACE.terms({ state, war, reason: "both exhausted" })
		expect(held.outcome).toBe("cession")
		expect([...held.transferred].sort()).toEqual(
			[...STATE.getNationProvinces({ state, root: seat })].sort(),
		)
		scoreAt(war, 0)
		const lost = PEACE.terms({ state, war, reason: "both exhausted" })
		expect(lost.outcome).toBe("white peace")
		expect(lost.transferred).toEqual([])
	})

	it("writes the score to the war ended note", () => {
		const war = declare(attackers[0])
		war.battleScore = -12
		PEACE.conclude({
			state,
			war,
			rng: rolls([]),
			reason: "both exhausted",
		})
		const note = state.events.findLast(
			(event) => event.tag === "war ended" && event.data.war === war.idx,
		)
		expect(note?.data).toMatchObject({
			score: -12,
			battles: -12,
			land: 0,
			capital: 0,
			outcome: "white peace",
		})
	})
})

describe("negotiated peace", () => {
	it("needs held land, no capital, and either a stall or a dictating score", () => {
		const war = declare(attackers[0])
		expect(
			PEACE.negotiate({ state, war, rng: rolls([0, 0]), stalled: true }),
		).toBe(false)
		occupy(war, seat)
		scoreAt(war, 40)
		expect(
			PEACE.negotiate({ state, war, rng: rolls([0, 0]), stalled: false }),
		).toBe(false)
		occupy(war, defender)
		expect(
			PEACE.negotiate({ state, war, rng: rolls([0, 0]), stalled: true }),
		).toBe(false)
		expect(war.dealConsidered).toBe(false)
	})

	it("offers one time in ten, accepts half, and never offers twice", () => {
		const war = declare(attackers[0])
		occupy(war, seat)
		scoreAt(war, 20)
		expect(
			PEACE.negotiate({ state, war, rng: rolls([0.1, 0]), stalled: true }),
		).toBe(false)
		expect(war.dealConsidered).toBe(false)
		expect(
			PEACE.negotiate({ state, war, rng: rolls([0.09, 0.5]), stalled: true }),
		).toBe(false)
		expect(war.dealConsidered).toBe(true)
		expect(
			PEACE.negotiate({ state, war, rng: rolls([0, 0]), stalled: true }),
		).toBe(false)
		const other = declare(attackers[1])
		occupy(other, nested)
		scoreAt(other, 60)
		expect(
			PEACE.negotiate({
				state,
				war: other,
				rng: rolls([0.09, 0.49]),
				stalled: false,
			}),
		).toBe(true)
	})

	it("sets who pays from the score and hands land back at zero or less", () => {
		const war = declare(attackers[0])
		occupy(war, seat)
		const at = (score: number) => {
			scoreAt(war, score)
			return PEACE.terms({ state, war, reason: "negotiated" })
		}
		expect(at(55)).toMatchObject({ outcome: "cession", payer: war.defender })
		expect(at(45)).toMatchObject({ outcome: "cession", payer: -1 })
		expect(at(15)).toMatchObject({ outcome: "cession", payer: -1 })
		expect(at(5)).toMatchObject({ outcome: "cession", payer: war.attacker })
		expect(at(0)).toMatchObject({
			outcome: "white peace",
			payer: -1,
			transferred: [],
		})
	})
})
