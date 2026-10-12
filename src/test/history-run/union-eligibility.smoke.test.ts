import { afterEach, describe, expect, it, vi } from "vitest"
import { ROYAL_MARRIAGE } from "@/model/history/sim/engine/events/diplomacy/marriage"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import type { SuccessionChoice } from "@/model/history/sim/engine/events/succession/systems/types"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { RNG, type SharedRng } from "@/model/shared/random/rng"
import { HEAP_FIXTURE } from "@/test/history-run/fixtures/heap"
import { REALMS_FIXTURE } from "@/test/history-run/fixtures/realms"
import { HISTORY_VALIDATION } from "@/test/history-run/report/validation"

function sequence(values: number[]): SharedRng {
	return RNG.fromSource({
		random: () => values.shift() ?? 0.5,
		nonPositiveWeightBehavior: "undefined",
	})
}

function scenario() {
	return REALMS_FIXTURE.neighbours({ neighbours: 2 })
}

function succeed({
	state,
	realm,
	choice,
	rng,
}: {
	state: HistoryState
	realm: number
	choice: Partial<SuccessionChoice>
	rng: SharedRng
}): void {
	const forced: SuccessionChoice = {
		system: "single_heir",
		house: "same",
		claim: 3,
		age: "fresh",
		juniors: 0,
		interregnum: false,
		daughterLine: false,
		...choice,
	}
	const spy = vi.spyOn(SUCCESSION_SYSTEMS, "choose").mockReturnValue(forced)
	try {
		SUCCESSION.runSuccession({
			state,
			realm,
			leaderIdx: state.leaderRuntime.idx[realm],
			rng,
		})
	} finally {
		spy.mockRestore()
	}
}

function tie({
	state,
	a,
	b,
}: {
	state: HistoryState
	a: number
	b: number
}): void {
	STATE.setRelation({ state, a, b, rel: STATE.rel.NONE })
	ROYAL_MARRIAGE.form({ state, a, b })
}

afterEach(() => vi.restoreAllMocks())

describe("new union links", () => {
	it("need two single-heir realms and keep an existing link whatever its government", () => {
		const { state, realms } = scenario()
		const [a, b] = realms
		expect(STATE.canUnite({ state, a, b })).toBe(true)
		state.governmentType[b] = GOVERNMENT.getGovIdx().elective_monarchy
		expect(STATE.canUnite({ state, a, b })).toBe(false)
		expect(STATE.canUniteAfterWar({ state, a, b })).toBe(false)
		state.governmentType[b] = GOVERNMENT.getGovIdx().feudal_monarchy
		STATE.setRelation({ state, a: b, b: a, rel: STATE.rel.PU_JUNIOR })
		state.governmentType[b] = GOVERNMENT.getGovIdx().elective_monarchy
		expect(STATE.canUnite({ state, a, b })).toBe(true)
	}, 120000)
})

describe("inheritance through a marriage tie", () => {
	it.each([
		true,
		false,
	])("forms a union under the larger realm when the heir realm is the larger (%s)", (heirLarger) => {
		const { state, realms, rng } = scenario()
		const heir = heirLarger ? realms[0] : realms[1]
		const partner = heirLarger ? realms[1] : realms[0]
		tie({ state, a: heir, b: partner })
		const ruler = state.leaderRuntime.rulerId[partner]
		succeed({
			state,
			realm: heir,
			choice: { house: "other", daughterLine: true },
			rng: sequence([0, 0.1]),
		})
		expect(state.leaderRuntime.rulerId[heir]).toBe(ruler)
		expect(state.leaderRuntime.rulerId[partner]).toBe(ruler)
		const senior = realms[0]
		const junior = senior === heir ? partner : heir
		expect(STATE.getRelation({ state, a: senior, b: junior })).toBe(
			STATE.rel.PU_JUNIOR,
		)
		expect(state.marriageTies.size).toBe(0)
		expect(
			HEAP_FIXTURE.current(state).filter((p) => [heir, partner].includes(p)),
		).toEqual([senior])
		const tracker = HISTORY_VALIDATION.tracker()
		HISTORY_VALIDATION.unions({ engine: state, tracker })
		HISTORY_VALIDATION.rulers({ engine: state, tracker })
		expect(tracker.violations).toEqual({})
		const before = state.events.length
		SUCCESSION.runSuccession({
			state,
			realm: junior,
			leaderIdx: state.leaderRuntime.idx[junior],
			rng,
		})
		expect(state.events.length).toBe(before)
	}, 120000)

	it("is closed while either realm presses a war for a throne", () => {
		const { state, realms } = scenario()
		const [heir, partner, third] = realms
		tie({ state, a: heir, b: partner })
		const war = STATE.createActiveWar({
			state,
			attacker: partner,
			defender: third,
			rng: HISTORY_RNG.createHistoryRng(3),
			options: { goal: "throne" },
		})
		expect(STATE.isPressing({ state, p: partner })).toBe(true)
		succeed({
			state,
			realm: heir,
			choice: { house: "other", daughterLine: true },
			rng: sequence([0, 0.1]),
		})
		expect(state.leaderRuntime.rulerId[heir]).not.toBe(
			state.leaderRuntime.rulerId[partner],
		)
		expect(state.leaderDynCurrent[heir]).toBe(state.leaderDynCurrent[partner])
		STATE.resolveWar({ state, war, transferred: [], receiver: partner })
	}, 120000)

	it("keeps the union through two reigns of the house and merges an adjacent junior at the third", () => {
		vi.spyOn(SUCCESSION_SYSTEMS, "districts").mockReturnValue([])
		const { state, realms, rng } = scenario()
		const [senior, junior] = realms
		STATE.unite({
			state,
			a: senior,
			b: junior,
			ruler: STATE_RULERS.read({ state, p: senior }),
			claim: 3,
			rng,
		})
		expect(state.unionGenerations.get(junior)).toBe(1)
		const adjacent = STATE.getNationNeighbors({
			state,
			nation: senior,
		}).includes(junior)
		for (const generation of [2, 3]) {
			const dying = state.leaderRuntime.rulerId[senior]
			succeed({ state, realm: senior, choice: { house: "same" }, rng })
			expect(state.leaderRuntime.rulerId[senior]).not.toBe(dying)
			if (generation === 3 && adjacent) {
				expect(STATE.isSovereign({ state, p: junior })).toBe(false)
				expect(state.leaderRuntime.rulerId[junior]).toBe(-1)
				continue
			}
			expect(state.leaderRuntime.rulerId[junior]).toBe(
				state.leaderRuntime.rulerId[senior],
			)
			expect(state.unionGenerations.get(junior)).toBe(generation)
			expect(HEAP_FIXTURE.current(state)).toContain(senior)
			expect(HEAP_FIXTURE.current(state)).not.toContain(junior)
		}
	}, 120000)

	it("ends the union on any other house and seats the junior with a ruler of the old one", () => {
		const { state, realms, rng } = scenario()
		const [senior, junior] = realms
		STATE.unite({
			state,
			a: senior,
			b: junior,
			ruler: STATE_RULERS.read({ state, p: senior }),
			claim: 3,
			rng,
		})
		const house = state.leaderDynCurrent[senior]
		succeed({ state, realm: senior, choice: { house: "new" }, rng })
		expect(STATE.getRelation({ state, a: junior, b: senior })).toBe(
			STATE.rel.NONE,
		)
		expect(state.unionGenerations.has(junior)).toBe(false)
		expect(state.leaderDynCurrent[junior]).toBe(house)
		expect(state.leaderClaimCurrent[junior]).toBe(2)
		expect(state.leaderDynCurrent[senior]).not.toBe(house)
		expect(state.leaderRuntime.rulerId[junior]).not.toBe(
			state.leaderRuntime.rulerId[senior],
		)
		expect(HEAP_FIXTURE.current(state)).toEqual(
			expect.arrayContaining([senior, junior]),
		)
		expect(
			state.events.some((note) => note.tag === "personal union ended"),
		).toBe(true)
	}, 120000)
})

describe("other replacements", () => {
	function united() {
		const context = scenario()
		const { state, realms, rng } = context
		const [senior, first, second] = realms
		for (const junior of [first, second])
			STATE.unite({
				state,
				a: senior,
				b: junior,
				ruler: STATE_RULERS.read({ state, p: senior }),
				claim: 3,
				rng,
			})
		return { ...context, senior, first, second }
	}

	it("copies a same-house replacement to every junior without counting a reign", () => {
		const { state, senior, first, second, rng } = united()
		const house = state.leaderDynCurrent[senior]
		const usurper = STATE_RULERS.draw({
			state,
			p: senior,
			dynasty: house,
			age: "fresh",
			rng,
		})
		STATE.seatRuler({
			state,
			p: senior,
			ruler: usurper,
			claim: 1,
			natural: false,
			rng,
		})
		for (const junior of [first, second]) {
			expect(state.leaderRuntime.rulerId[junior]).toBe(usurper.rulerId)
			expect(state.unionGenerations.get(junior)).toBe(1)
			expect(STATE.isUnionJunior({ state, p: junior })).toBe(true)
		}
		expect(
			HEAP_FIXTURE.current(state).filter((p) =>
				[senior, first, second].includes(p),
			),
		).toEqual([senior])
	}, 120000)

	it("detaches every junior when another house replaces the senior", () => {
		const { state, senior, first, second, rng } = united()
		const house = state.leaderDynCurrent[senior]
		const usurper = STATE_RULERS.draw({
			state,
			p: senior,
			dynasty: -1,
			age: "fresh",
			rng,
		})
		STATE.seatRuler({
			state,
			p: senior,
			ruler: usurper,
			claim: 0,
			natural: false,
			rng,
		})
		for (const junior of [first, second]) {
			expect(STATE.isUnionJunior({ state, p: junior })).toBe(false)
			expect(state.leaderDynCurrent[junior]).toBe(house)
			expect(state.leaderRuntime.rulerId[junior]).not.toBe(usurper.rulerId)
		}
		expect(HEAP_FIXTURE.current(state)).toEqual(
			expect.arrayContaining([senior, first, second]),
		)
	}, 120000)

	it("detaches only a replaced junior, even by a ruler of its own house", () => {
		const { state, senior, first, second, rng } = united()
		const ruler = state.leaderRuntime.rulerId[senior]
		const usurper = STATE_RULERS.draw({
			state,
			p: first,
			dynasty: state.leaderDynCurrent[senior],
			age: "fresh",
			rng,
		})
		STATE.seatRuler({
			state,
			p: first,
			ruler: usurper,
			claim: 1,
			natural: false,
			rng,
		})
		expect(STATE.isUnionJunior({ state, p: first })).toBe(false)
		expect(state.leaderRuntime.rulerId[first]).toBe(usurper.rulerId)
		expect(state.leaderRuntime.rulerId[senior]).toBe(ruler)
		expect(state.leaderRuntime.rulerId[second]).toBe(ruler)
		expect(STATE.isUnionJunior({ state, p: second })).toBe(true)
		expect(state.unionGenerations.has(first)).toBe(false)
		expect(HEAP_FIXTURE.current(state)).toEqual(
			expect.arrayContaining([senior, first]),
		)
		expect(HEAP_FIXTURE.current(state)).not.toContain(second)
	}, 120000)
})

describe("juniors that lose their senior", () => {
	it("stay together under the larger one with their counters", () => {
		const { state, realms, rng } = scenario()
		const [senior, first, second] = realms
		for (const junior of [first, second])
			STATE.unite({
				state,
				a: senior,
				b: junior,
				ruler: STATE_RULERS.read({ state, p: senior }),
				claim: 3,
				rng,
			})
		for (const junior of [first, second]) state.unionGenerations.set(junior, 2)
		const before = state.events.length
		STATE.releaseSubjectRelations({ state, nation: senior })
		const notes = state.events
			.slice(before)
			.filter((note) => note.tag === "personal union continued")
		expect(notes).toHaveLength(1)
		const kept = notes[0].data.senior as number
		const left = notes[0].data.juniors as number[]
		expect([kept, ...left].sort()).toEqual([first, second].sort())
		expect(STATE.seniorOf({ state, p: left[0] })).toBe(kept)
		expect(state.unionGenerations.get(left[0])).toBe(2)
		expect(state.unionGenerations.has(kept)).toBe(false)
		expect(HEAP_FIXTURE.current(state)).toContain(kept)
		const tracker = HISTORY_VALIDATION.tracker()
		HISTORY_VALIDATION.unions({ engine: state, tracker })
		expect(tracker.violations["ruler of realms outside one union group"]).toBe(
			1,
		)
	}, 120000)

	it("leaves a lone junior on its own throne with the ruler it had", () => {
		const { state, realms, rng } = scenario()
		const [senior, junior] = realms
		const ruler = state.leaderRuntime.rulerId[senior]
		STATE.unite({
			state,
			a: senior,
			b: junior,
			ruler: STATE_RULERS.read({ state, p: senior }),
			claim: 3,
			rng,
		})
		STATE.releaseSubjectRelations({ state, nation: senior })
		expect(STATE.isUnionJunior({ state, p: junior })).toBe(false)
		expect(state.leaderRuntime.rulerId[junior]).toBe(ruler)
		expect(HEAP_FIXTURE.current(state)).toContain(junior)
	}, 120000)
})

describe("validation", () => {
	it("flags one ruler governing two realms outside a union group", () => {
		const { state, realms } = scenario()
		const [a, b] = realms
		STATE_RULERS.write({
			state,
			p: b,
			ruler: STATE_RULERS.read({ state, p: a }),
			claim: 3,
		})
		const tracker = HISTORY_VALIDATION.tracker()
		HISTORY_VALIDATION.unions({ engine: state, tracker })
		expect(tracker.violations["ruler of realms outside one union group"]).toBe(
			1,
		)
	}, 120000)
})
