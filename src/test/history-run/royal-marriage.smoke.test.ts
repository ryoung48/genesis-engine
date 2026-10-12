import { expect, it, vi } from "vitest"
import { ROYAL_MARRIAGE } from "@/model/history/sim/engine/events/diplomacy/marriage"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { WAR } from "@/model/history/sim/engine/events/war"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { RNG, type SharedRng } from "@/model/shared/random/rng"
import { REALMS_FIXTURE } from "@/test/history-run/fixtures/realms"

function constant(value: number): SharedRng {
	return RNG.fromSource({
		random: () => value,
		nonPositiveWeightBehavior: "undefined",
	})
}

// Every realm outside the fixture stops marrying for alliance, so a yearly
// pass concerns only the fixture's realms.
function isolate({
	state,
	realms,
}: {
	state: HistoryState
	realms: number[]
}): void {
	for (let p = 0; p < state.P; p++)
		if (!realms.includes(p) && STATE.isSovereign({ state, p }))
			state.governmentType[p] = GOVERNMENT.getGovIdx().theocracy
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

it("allies an eligible bordering pair when the roll succeeds and does nothing when it fails", () => {
	const fx = REALMS_FIXTURE.neighbours({ neighbours: 1 })
	const { state, realms } = fx
	isolate({ state, realms })
	const [a, b] = realms
	expect(ROYAL_MARRIAGE.eligible({ state, a, b })).toBe(true)
	ROYAL_MARRIAGE.runYear({ state, rng: constant(0.9) })
	expect(state.marriageTies.size).toBe(0)
	ROYAL_MARRIAGE.runYear({ state, rng: constant(0) })
	expect(state.marriageTies.size).toBe(1)
	expect(STATE.getRelation({ state, a, b })).toBe(STATE.rel.ALLY)
	expect(STATE.getDisposition({ state, a, b })).toBe(STATE.disp.TRUSTED)
	expect(ROYAL_MARRIAGE.bound({ state, a, b })).toBe(true)
	expect(
		state.events.findLast((note) => note.tag === "marriage alliance"),
	).toMatchObject({ data: { first: Math.min(a, b) } })
	ROYAL_MARRIAGE.runYear({ state, rng: constant(0) })
	expect(state.marriageTies.size).toBe(1)
}, 120000)

it("halves the chance of another tie for each tie a realm holds, as initiator and as partner", () => {
	const fx = REALMS_FIXTURE.neighbours({ neighbours: 3 })
	const { state, hub, realms } = fx
	isolate({ state, realms })
	const others = realms.filter((p) => p !== hub)
	const base = ROYAL_MARRIAGE.chance({ state, realm: hub })
	expect(base).toBeCloseTo(0.0275, 12)
	expect(ROYAL_MARRIAGE.acceptance({ state, realm: hub })).toBe(1)
	tie({ state, a: hub, b: others[0] })
	expect(ROYAL_MARRIAGE.chance({ state, realm: hub })).toBeCloseTo(base / 2, 12)
	expect(ROYAL_MARRIAGE.acceptance({ state, realm: hub })).toBe(0.5)
	expect(ROYAL_MARRIAGE.chance({ state, realm: others[0] })).toBeCloseTo(
		base / 2,
		12,
	)
	tie({ state, a: hub, b: others[1] })
	expect(ROYAL_MARRIAGE.chance({ state, realm: hub })).toBeCloseTo(base / 4, 12)
	expect(ROYAL_MARRIAGE.acceptance({ state, realm: hub })).toBe(0.25)
	expect(ROYAL_MARRIAGE.acceptance({ state, realm: others[2] })).toBe(1)
}, 120000)

it("ends a realm's ties when its ruler is replaced and keeps the alliance", () => {
	const fx = REALMS_FIXTURE.neighbours({ neighbours: 2 })
	const { state, realms, rng } = fx
	const [a, b, c] = realms
	tie({ state, a: a, b: b })
	tie({ state, a: a, b: c })
	const endedBefore = state.events.filter(
		(note) => note.tag === "marriage alliance ended",
	).length
	STATE.foundRuler({
		state,
		p: a,
		ruler: { dynasty: -1, age: "fresh", claim: 3 },
		rng,
	})
	expect(state.marriageTies.size).toBe(0)
	expect(STATE.getRelation({ state, a, b })).toBe(STATE.rel.ALLY)
	expect(
		state.events.filter((note) => note.tag === "marriage alliance ended"),
	).toHaveLength(endedBefore + 2)
}, 120000)

it("ends a tie when its pair stops being eligible", () => {
	const fx = REALMS_FIXTURE.neighbours({ neighbours: 1 })
	const { state, realms } = fx
	const [a, b] = realms
	tie({ state, a: a, b: b })
	ROYAL_MARRIAGE.review({ state })
	expect(state.marriageTies.size).toBe(1)
	state.governmentType[b] = GOVERNMENT.getGovIdx().theocracy
	ROYAL_MARRIAGE.review({ state })
	expect(state.marriageTies.size).toBe(0)
}, 120000)

it("reads the saved partners after the tie map is cleared to press a minor's foreign claim", () => {
	const fx = REALMS_FIXTURE.neighbours({ neighbours: 1 })
	const { state, realms, rng } = fx
	const [heir, partner] = realms
	tie({ state, a: heir, b: partner })
	const press = vi.spyOn(WAR, "pressClaim").mockReturnValue(undefined)
	const choose = vi.spyOn(SUCCESSION_SYSTEMS, "choose").mockReturnValue({
		system: "single_heir",
		house: "same",
		claim: 3,
		age: "inherited",
		juniors: 0,
		interregnum: false,
		daughterLine: false,
	})
	const real = STATE_RULERS.draw
	const draw = vi
		.spyOn(STATE_RULERS, "draw")
		.mockImplementationOnce((params) => {
			const ruler = real(params)
			ruler.birthMs = params.state.time - 5 * STATE.yearMs
			ruler.deathMs = params.state.time + 60 * STATE.yearMs
			return ruler
		})
	try {
		SUCCESSION.runSuccession({
			state,
			realm: heir,
			leaderIdx: state.leaderRuntime.idx[heir],
			rng,
		})
	} finally {
		draw.mockRestore()
		choose.mockRestore()
	}
	expect(state.marriageTies.size).toBe(0)
	expect(state.regency[heir]).toBe(1)
	expect(press).toHaveBeenCalledWith(
		expect.objectContaining({ attacker: partner, defender: heir }),
	)
}, 120000)
