import { expect, it } from "vitest"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { RNG, type SharedRng } from "@/model/shared/random/rng"
import { HEAP_FIXTURE } from "@/test/history-run/fixtures/heap"
import { REALMS_FIXTURE } from "@/test/history-run/fixtures/realms"

function sequence(values: number[]): SharedRng {
	return RNG.fromSource({
		random: () => values.shift() ?? 0.5,
		nonPositiveWeightBehavior: "undefined",
	})
}

function child({
	state,
	realm,
	rng,
}: {
	state: HistoryState
	realm: number
	rng: SharedRng
}): void {
	const ruler = STATE_RULERS.draw({
		state,
		p: realm,
		dynasty: -1,
		age: "fresh",
		rng,
	})
	ruler.birthMs = state.time - 10 * STATE.yearMs
	ruler.deathMs = state.time + 60 * STATE.yearMs
	STATE.seatRuler({ state, p: realm, ruler, claim: 3, natural: false, rng })
}

it("governs a ruler under sixteen by council until the sixteenth birthday", () => {
	const { state, realms, rng } = REALMS_FIXTURE.neighbours({ neighbours: 2 })
	const [realm] = realms
	child({ state, realm, rng })
	expect(state.regency[realm]).toBe(1)
	expect(REGENCY.weak({ state, realm })).toBe(true)
	const leader = state.leaderRuntime.idx[realm]
	const coming = HEAP_FIXTURE.comingsOfAge(state).filter(
		(event) => event.realm === realm && event.idx === leader,
	)
	expect(coming).toHaveLength(1)
	expect(coming[0].time).toBe(
		state.leaderRuntime.birth[realm] + STATE.deltaYear(STATE_RULERS.adultAge),
	)
	state.time = coming[0].time
	REGENCY.comeOfAge({ state, realm, leader, rng })
	expect(state.regency[realm]).toBe(0)
	expect(REGENCY.weak({ state, realm })).toBe(false)
	expect(
		state.events.filter((note) => note.tag === "regency ended").at(-1)?.data,
	).toEqual({ nation: realm, cause: "age" })
}, 120000)

it("ignores the coming of age of a ruler already replaced", () => {
	const { state, realms, rng } = REALMS_FIXTURE.neighbours({ neighbours: 2 })
	const [realm] = realms
	child({ state, realm, rng })
	const leader = state.leaderRuntime.idx[realm]
	STATE.foundRuler({
		state,
		p: realm,
		ruler: { dynasty: -1, age: "fresh", claim: 3 },
		rng,
	})
	expect(state.regency[realm]).toBe(0)
	state.time += 7 * STATE.yearMs
	const notes = state.events.length
	REGENCY.comeOfAge({ state, realm, leader, rng })
	expect(state.events).toHaveLength(notes)
}, 120000)

it.each([
	{ kinsman: true, claim: 1 },
	{ kinsman: false, claim: 0 },
])("lets a regency end in usurpation (kinsman: $kinsman)", ({
	kinsman,
	claim,
}) => {
	const { state, realms, rng } = REALMS_FIXTURE.neighbours({ neighbours: 2 })
	const [realm] = realms
	child({ state, realm, rng })
	const ward = STATE_RULERS.read({ state, p: realm })
	// Realms roll in ascending id; only the ward's realm is under a regency.
	const yearly = sequence([0, kinsman ? 0 : 0.99])
	SUCCESSION.runYear({ state, rng: yearly })
	const usurper = STATE_RULERS.read({ state, p: realm })
	expect(usurper.rulerId).not.toBe(ward.rulerId)
	expect(state.leaderClaimCurrent[realm]).toBe(claim)
	expect(usurper.dynasty === ward.dynasty).toBe(kinsman)
	expect(state.regency[realm]).toBe(0)
	const note = state.events.findLast((entry) => entry.tag === "usurpation")
	expect(note?.data).toMatchObject({ nation: realm, kinsman })
	expect(HEAP_FIXTURE.current(state)).toContain(realm)
}, 120000)
