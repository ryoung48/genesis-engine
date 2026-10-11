import { expect, it } from "vitest"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { HEAP_FIXTURE } from "@/test/history-run/fixtures/heap"
import { REALMS_FIXTURE } from "@/test/history-run/fixtures/realms"

const DRAWS = 4000

it("seats a ruler whose columns, death date and queued succession agree", () => {
	const { state, realms, rng } = REALMS_FIXTURE.neighbours({ neighbours: 2 })
	const [realm] = realms
	STATE.foundRuler({
		state,
		p: realm,
		ruler: { dynasty: -1, age: "inherited", claim: 3 },
		rng,
	})
	const runtime = state.leaderRuntime
	const ruler = STATE_RULERS.read({ state, p: realm })
	expect(ruler.rulerId).toBeGreaterThanOrEqual(0)
	expect(ruler.deathMs).toBeGreaterThan(ruler.birthMs)
	expect(ruler.birthMs).toBeLessThanOrEqual(state.time)
	expect(ruler.nameOrigin).toBe(realm)
	expect(state.dynastyOrigin.get(ruler.dynasty)).toBe(realm)
	expect(state.leaderClaimCurrent[realm]).toBe(3)
	expect(state.leaderBirthYearCurrent[realm]).toBeCloseTo(
		ruler.birthMs / STATE.yearMs,
		2,
	)
	const system = state.cultureGenderSystems[state.culture[realm]]
	expect(
		GENDER_SYSTEM.resolveLeaderGender({ system, seed: ruler.nameSeed }) ===
			"female",
	).toBe(ruler.sex === 1)
	const queued = HEAP_FIXTURE.successions(state).filter(
		(event) => event.realm === realm && event.idx === runtime.idx[realm],
	)
	expect(queued).toHaveLength(1)
	expect(queued[0].time).toBe(Math.max(state.time, ruler.deathMs))
	expect(HEAP_FIXTURE.current(state)).toContain(realm)
}, 120000)

it("replaces a ruler without leaving the old succession current", () => {
	const { state, realms, rng } = REALMS_FIXTURE.neighbours({ neighbours: 2 })
	const [realm] = realms
	const before = state.leaderRuntime.idx[realm]
	STATE.foundRuler({
		state,
		p: realm,
		ruler: { dynasty: -1, age: "fresh", claim: 2 },
		rng,
	})
	expect(state.leaderRuntime.idx[realm]).toBeGreaterThan(before)
	expect(
		HEAP_FIXTURE.successions(state).filter(
			(event) =>
				event.realm === realm && event.idx === state.leaderRuntime.idx[realm],
		),
	).toHaveLength(1)
	expect(HEAP_FIXTURE.current(state).filter((p) => p === realm)).toHaveLength(1)
}, 120000)

it("gives a union junior the columns of its senior and no succession of its own", () => {
	const { state, realms, rng } = REALMS_FIXTURE.neighbours({ neighbours: 2 })
	const [senior, junior] = realms
	STATE.unite({
		state,
		a: senior,
		b: junior,
		ruler: STATE_RULERS.read({ state, p: senior }),
		claim: 3,
		rng,
	})
	expect(STATE_RULERS.read({ state, p: junior })).toEqual(
		STATE_RULERS.read({ state, p: senior }),
	)
	expect(state.leaderClaimCurrent[junior]).toBe(
		state.leaderClaimCurrent[senior],
	)
	const current = HEAP_FIXTURE.current(state)
	expect(current).toContain(senior)
	expect(current).not.toContain(junior)
}, 120000)

it("draws every ruler old enough to die after the accession, within its age table", () => {
	const { state, realms } = REALMS_FIXTURE.neighbours({ neighbours: 2 })
	const rng = HISTORY_RNG.createHistoryRng(11)
	const [realm] = realms
	let dyingBeforeAccession = 0
	let electedUnderSixteen = 0
	let freshOutsideRange = 0
	let negativeAge = 0
	for (let draw = 0; draw < DRAWS; draw++)
		for (const age of ["inherited", "elected", "fresh"] as const) {
			const ruler = STATE_RULERS.draw({ state, p: realm, dynasty: 0, age, rng })
			const years = (state.time - ruler.birthMs) / STATE.yearMs
			if (ruler.deathMs <= state.time) dyingBeforeAccession++
			if (years < 0) negativeAge++
			if (age === "elected" && years < STATE_RULERS.adultAge)
				electedUnderSixteen++
			if (age === "fresh" && (years < 20 || years > 50)) freshOutsideRange++
		}
	expect(dyingBeforeAccession).toBe(0)
	expect(negativeAge).toBe(0)
	expect(electedUnderSixteen).toBe(0)
	expect(freshOutsideRange).toBe(0)
}, 120000)
