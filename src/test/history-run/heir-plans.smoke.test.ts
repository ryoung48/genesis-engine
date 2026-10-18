import { expect, it, vi } from "vitest"
import type { HeirPlanChange } from "@/model/history/record/rulers/types"
import type { HistoryRecord } from "@/model/history/record/types"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { PARTITION } from "@/model/history/sim/engine/events/succession/partition"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { HEIR_PLAN } from "@/model/history/sim/engine/state/rulers/heirs"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { SIM_RECORD } from "@/model/history/sim/record"
import { RNG, type SharedRng } from "@/model/shared/random/rng"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { HISTORY_RUN } from "@/test/history-run"
import { DISTRICT_FIXTURE } from "@/test/history-run/fixtures/district-tiers"
import { HISTORY_VALIDATION } from "@/test/history-run/report/validation"

function constant(value: number): SharedRng {
	return RNG.fromSource({
		random: () => value,
		nonPositiveWeightBehavior: "undefined",
	})
}

function fixture() {
	const { engine: state, generated } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 3000,
	})
	const p = [...state.rulerRealmCounts.keys()]
		.map((id) => state.leaderRuntime.rulerId.indexOf(id))
		.find((realm) => !STATE.isUnionJunior({ state, p: realm }))!
	state.governmentType[p] = GOVERNMENT.getGovIdx().feudal_monarchy
	const rng = constant(0.4)
	const ruler = {
		...STATE_RULERS.draw({ state, p, dynasty: -1, age: "fresh", rng }),
		sex: 0,
		birthMs: state.time - 40 * STATE.yearMs,
		deathMs: state.time + 20 * STATE.yearMs,
	}
	STATE.seatRuler({ state, p, ruler, claim: 3, natural: false, rng })
	HEIR_PLAN.reconcile(state)
	return {
		state,
		p,
		ruler,
		rng,
		world: generated as unknown as SerializedGenesisWorld,
	}
}

function planEvents(record: HistoryRecord): HeirPlanChange[] {
	return record.events.nationEvents
		.flatMap((log) =>
			log.events
				.filter((event) => event.kind === "heirPlanChange")
				.map((event) => event.payload as unknown as HeirPlanChange),
		)
		.sort((a, b) => a.transactionId - b.transactionId)
}

it("retains initial plan creations and union cancellations in the first transaction", () => {
	const { engine: state, generated } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const initial = state.journal[0]
	expect(initial.transactionId).toBe(0)
	expect(initial.heirCancellations.length).toBeGreaterThan(0)
	const world = generated as unknown as SerializedGenesisWorld
	const record = SIM_RECORD.buildProceduralState({
		world,
		startTimeMs: state.time,
	})
	SIM_RECORD.appendJournal({
		translator: SIM_RECORD.createTranslator({ state: record, world }),
		transactions: state.journal,
	})
	const validation = HISTORY_VALIDATION.tracker()
	HISTORY_VALIDATION.heirs({
		engine: state,
		tracker: validation,
		record: record.record,
	})
	HISTORY_VALIDATION.assert(validation)
	expect(
		planEvents(record.record).flatMap((event) => event.created),
	).toHaveLength(state.heirPlanStats.rolled)
})

it("keeps two levels and preserves every random result on repeated seating", () => {
	const { state, p, ruler } = fixture()
	const plan = state.heirPlans.get(ruler.rulerId)!
	expect(plan.primary).not.toBeNull()
	const childPlan = state.heirPlans.get(plan.primary!.rulerId)!
	expect(childPlan).toBeDefined()
	if (childPlan.primary)
		expect(state.heirPlans.has(childPlan.primary.rulerId)).toBe(false)
	const rng = constant(0.2)
	const random = vi.spyOn(rng, "random")
	const sequence = { ...state.rulerSequence }
	const rolled = state.heirPlanStats.rolled
	STATE.seatRuler({ state, p, ruler, claim: 3, natural: false, rng })
	HEIR_PLAN.ensure({ state, p, ruler, rng })
	expect(state.heirPlans.get(ruler.rulerId)).toBe(plan)
	expect(state.rulerSequence).toEqual(sequence)
	expect(state.heirPlanStats.rolled).toBe(rolled)
	expect(random).not.toHaveBeenCalled()
	STATE.seatRuler({
		state,
		p,
		ruler: plan.primary!,
		claim: 3,
		natural: true,
		rng,
	})
	HEIR_PLAN.reconcile(state)
	expect(state.heirPlans.get(plan.primary!.rulerId)).toBe(childPlan)
	if (childPlan.primary)
		expect(state.heirPlans.has(childPlan.primary.rulerId)).toBe(true)
	expect(state.heirPlans.size).toBeLessThanOrEqual(
		2 * state.rulerRealmCounts.size,
	)
})

it("plans siblings of the primary who survive their shared parent", () => {
	const { state, ruler } = fixture()
	const plan = state.heirPlans.get(ruler.rulerId)!
	expect(plan.juniors.length).toBeGreaterThan(0)
	for (const child of [plan.primary!, ...plan.juniors]) {
		expect(child.birthMs).toBeGreaterThanOrEqual(
			ruler.birthMs + (16 + 280 / 365) * STATE.yearMs - 1,
		)
		expect(child.birthMs).toBeLessThanOrEqual(ruler.deathMs)
		expect(child.deathMs).toBeGreaterThan(ruler.deathMs)
		expect(child.dynasty).toBe(ruler.dynasty)
	}
	for (const junior of plan.juniors)
		expect(junior.birthMs).toBeGreaterThan(plan.primary!.birthMs)
	expect(state.heirPlanStats.biologyViolations).toBe(0)
})

it("clips inherited bins, rejects empty windows and enforces the exclusive maternal boundary", () => {
	const { state, p, ruler } = fixture()
	const draw = (parent: typeof ruler) =>
		STATE_RULERS.drawHeir({
			state,
			p,
			parent,
			olderBirthMs: null,
			rng: constant(0),
		})
	expect(
		draw({ ...ruler, deathMs: ruler.birthMs + 16 * STATE.yearMs }),
	).toBeNull()
	expect(
		draw({
			...ruler,
			deathMs: ruler.birthMs + (16 + 280 / 365) * STATE.yearMs,
		}),
	).toBeNull()
	const mother = {
		...ruler,
		sex: 1,
		deathMs: ruler.birthMs + 60 * STATE.yearMs,
	}
	expect(draw(mother)).toBeNull()
	const child = STATE_RULERS.drawHeir({
		state,
		p,
		parent: mother,
		olderBirthMs: null,
		rng: constant(0.999),
	})!
	expect(child.birthMs).toBeLessThan(mother.birthMs + 45 * STATE.yearMs)
	expect(child.birthMs).toBeGreaterThanOrEqual(
		mother.birthMs + (16 + 280 / 365) * STATE.yearMs - 1,
	)
	expect(child.deathMs).toBeGreaterThan(mother.deathMs)
	expect(
		STATE_RULERS.drawHeir({
			state,
			p,
			parent: ruler,
			olderBirthMs: ruler.deathMs,
			rng: constant(0.4),
		}),
	).toBeNull()
	const old = STATE_RULERS.draw({
		state,
		p,
		dynasty: ruler.dynasty,
		age: "fresh",
		rng: { ...constant(0.5), uniform: () => 100 },
	})
	expect(old.deathMs).toBeGreaterThan(state.time)
})

it("rejects a direct-child outcome with no fertile window without rerolling on repeated ensure", () => {
	const { state, p, ruler } = fixture()
	const juvenile = {
		...ruler,
		rulerId: state.rulerSequence.nextRuler++,
		deathMs: ruler.birthMs + 15 * STATE.yearMs,
	}
	const rejected = state.heirPlanStats.fertilityRejections
	const rng = constant(0.4)
	HEIR_PLAN.ensure({ state, p, ruler: juvenile, rng })
	const plan = state.heirPlans.get(juvenile.rulerId)!
	expect(plan.outcome.son).toBe(false)
	expect(plan.primary).toBeNull()
	expect(plan.juniors).toEqual([])
	expect(state.heirPlanStats.fertilityRejections).toBe(rejected + 1)
	HEIR_PLAN.ensure({ state, p, ruler: juvenile, rng })
	expect(state.heirPlanStats.fertilityRejections).toBe(rejected + 1)
})

it("fulfills a natural inheritance with the promised identity and preserves its existing plan", () => {
	const { state, p, ruler } = fixture()
	const plan = state.heirPlans.get(ruler.rulerId)!
	const primary = plan.primary!
	const childPlan = state.heirPlans.get(primary.rulerId)
	state.time = ruler.deathMs
	SUCCESSION.runSuccession({
		state,
		realm: p,
		leaderIdx: state.leaderRuntime.idx[p],
		rng: constant(0.99),
	})
	HEIR_PLAN.reconcile(state)
	expect(STATE_RULERS.read({ state, p })).toEqual(primary)
	expect(state.heirPlans.get(primary.rulerId)).toBe(childPlan)
	expect(state.pendingJournal.heirFulfillments).toContainEqual(
		expect.objectContaining({
			rulerId: ruler.rulerId,
			successor: STATE_RULERS.ref({ state, ruler: primary }),
		}),
	)
	expect(
		state.pendingJournal.heirCancellations.some(
			(entry) => entry.rulerId === ruler.rulerId,
		),
	).toBe(false)
	expect(() =>
		SUCCESSION_SYSTEMS.choose({
			state,
			realm: p,
			plan: null,
			rng: constant(0.5),
		}),
	).toThrow("no heir plan")
})

it.each([
	"elective_monarchy",
	"theocracy",
] as const)("cancels an unused outgoing promise under %s", (government) => {
	const { state, p, ruler } = fixture()
	const plan = state.heirPlans.get(ruler.rulerId)!
	state.governmentType[p] = GOVERNMENT.getGovIdx()[government]
	state.time = ruler.deathMs
	SUCCESSION.runSuccession({
		state,
		realm: p,
		leaderIdx: state.leaderRuntime.idx[p],
		rng: constant(0.99),
	})
	HEIR_PLAN.reconcile(state)
	expect(state.pendingJournal.heirCancellations).toContainEqual({
		root: p,
		rulerId: ruler.rulerId,
		reason: "unused",
	})
	expect(state.pendingJournal.heirCancellations).toContainEqual({
		root: p,
		rulerId: plan.primary!.rulerId,
		reason: "unreachable",
	})
	expect(plan.fulfilled).toBe(false)
})

it("retains a shared person's promises until the last realm copy disappears", () => {
	const { state, p, ruler, rng } = fixture()
	const other = [...state.rulerRealmCounts.keys()]
		.map((id) => state.leaderRuntime.rulerId.indexOf(id))
		.find((realm) => realm !== p)!
	const plan = state.heirPlans.get(ruler.rulerId)
	STATE_RULERS.write({ state, p: other, ruler, claim: 3 })
	STATE_RULERS.clear({ state, p })
	HEIR_PLAN.reconcile(state)
	expect(state.heirPlans.get(ruler.rulerId)).toBe(plan)
	STATE_RULERS.clear({ state, p: other })
	STATE_RULERS.write({ state, p, ruler, claim: 3 })
	HEIR_PLAN.ensure({ state, p, ruler, rng })
	HEIR_PLAN.reconcile(state)
	expect(state.heirPlans.get(ruler.rulerId)).toBe(plan)
	STATE_RULERS.clear({ state, p })
	HEIR_PLAN.reconcile(state)
	expect(state.heirPlans.has(ruler.rulerId)).toBe(false)
})

it("records intermediate and cleared owners, plan-only transactions and resumable translation", () => {
	const { state, p, ruler, rng, world } = fixture()
	const startTimeMs = state.time
	const validation = HISTORY_VALIDATION.tracker()
	const first = SIM_RECORD.buildProceduralState({ world, startTimeMs })
	const paused = SIM_RECORD.createTranslator({ state: first, world })
	const notes = state.events.length
	const plan = state.heirPlans.get(ruler.rulerId)!
	HEIR_PLAN.fulfill({
		state,
		plan,
		house: "same",
		claim: 3,
		successor: plan.primary!,
	})
	STATE.seatRuler({
		state,
		p,
		ruler: plan.primary!,
		claim: 3,
		natural: true,
		rng,
	})
	STATE.foundRuler({
		state,
		p,
		ruler: { dynasty: -1, age: "fresh", claim: 3 },
		rng,
	})
	STATE_RULERS.clear({ state, p })
	HEIR_PLAN.reconcile(state)
	JOURNAL.flush({ state, noteCursor: notes, initial: false, census: false })
	const initialBatch = [...state.journal]
	SIM_RECORD.appendJournal({ translator: paused, transactions: state.journal })
	HISTORY_VALIDATION.heirs({
		engine: state,
		tracker: validation,
		record: first.record,
	})
	const promises = JSON.stringify(planEvents(first.record))
	const last = state.journalSequence
	JOURNAL.releaseSent(state)
	const another = STATE_RULERS.draw({
		state,
		p,
		dynasty: -1,
		age: "fresh",
		rng,
	})
	const carrier = state.leaderRuntime.rulerId.findIndex((id) => id >= 0)
	expect(carrier).not.toBe(p)
	HEIR_PLAN.ensure({ state, p: carrier, ruler: another, rng })
	HEIR_PLAN.reconcile(state)
	JOURNAL.flush({ state, noteCursor: 0, initial: false, census: false })
	expect(state.journal).toHaveLength(1)
	expect(state.journal[0].transactionId).toBe(last)
	SIM_RECORD.appendJournal({ translator: paused, transactions: state.journal })
	HISTORY_VALIDATION.heirs({
		engine: state,
		tracker: validation,
		record: first.record,
	})
	HISTORY_VALIDATION.assert(validation)
	const once = SIM_RECORD.buildProceduralState({ world, startTimeMs })
	SIM_RECORD.appendJournal({
		translator: SIM_RECORD.createTranslator({ state: once, world }),
		transactions: [...initialBatch, ...state.journal],
	})
	expect(planEvents(first.record)).toEqual(planEvents(once.record))
	expect(
		JSON.stringify(
			planEvents(first.record).filter((event) => event.transactionId < last),
		),
	).toBe(promises)
	const changes = planEvents(first.record)
	expect(
		changes
			.flatMap((event) => event.fulfilled)
			.some((entry) => entry.rulerId === ruler.rulerId),
	).toBe(true)
	expect(changes.at(-1)!.transactionId).toBe(last)
	expect(JSON.stringify(changes)).not.toMatch(/"death\w*"\s*:/)
})

it("seats pre-drawn partition juniors in age order without drawing replacement rulers", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 6,
		root: 0,
		edges: [
			[0, 1],
			[0, 2],
			[2, 3],
			[0, 4],
			[4, 5],
		],
		titles: [
			{ tier: 3, seat: 0, provinces: [0, 1, 2, 3, 4, 5] },
			{ tier: 2, seat: 0, provinces: [0, 1] },
			{ tier: 2, seat: 2, provinces: [2, 3] },
			{ tier: 2, seat: 4, provinces: [4, 5] },
		],
	})
	const { state } = fx
	const rng = constant(0.4)
	const ruler = {
		...STATE_RULERS.draw({ state, p: 0, dynasty: -1, age: "fresh", rng }),
		sex: 0,
		birthMs: state.time - 60 * STATE.yearMs,
		deathMs: state.time,
	}
	HEIR_PLAN.ensure({ state, p: 0, ruler, rng })
	const plan = state.heirPlans.get(ruler.rulerId)!
	const primary = plan.primary!
	STATE.seatRuler({ state, p: 0, ruler: primary, claim: 3, natural: true, rng })
	const junior = plan.juniors[0]
	expect(junior).toBeDefined()
	const draw = vi.spyOn(STATE_RULERS, "draw")
	try {
		expect(
			PARTITION.divide({
				state,
				realm: 0,
				juniors: [junior],
				late: STATE_RULERS.ref({ state, ruler }),
				primary: STATE_RULERS.ref({ state, ruler: primary }),
				rng,
			}),
		).toBe(1)
		expect(draw).not.toHaveBeenCalled()
		const seat = state.leaderRuntime.rulerId.indexOf(junior.rulerId)
		expect(seat).toBeGreaterThan(0)
		expect(STATE_RULERS.read({ state, p: seat })).toEqual(junior)
	} finally {
		draw.mockRestore()
	}
})
