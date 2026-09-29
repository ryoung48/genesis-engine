import { expect, it } from "vitest"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { ROYAL_MARRIAGES } from "@/model/history/sim/engine/events/people/royal-marriages"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { HISTORY_RUN } from "@/test/history-run"

it("transfers vassal tribute and keeps subject alliances inside the ruler's bloc", () => {
	const { engine } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	const sovereigns = Array.from({ length: engine.P }, (_, p) => p).filter(
		(p) =>
			!engine.desolate[p] &&
			STATE.isSovereign({ state: engine, p }) &&
			GOVERNMENT.marriageAlliancesOfIndex(engine.governmentType[p]) &&
			engine.people.rulerOf[p] >= 0,
	)
	const [r, s, x, y, sibling] = sovereigns.slice(0, 5)
	if (sibling === undefined) throw new Error("too few sovereigns")
	for (const a of [r, s, x, y, sibling])
		for (const b of [r, s, x, y, sibling])
			if (a < b) STATE.setRelation({ state: engine, a, b, rel: STATE.rel.NONE })
	for (const nation of [r, s, x, y, sibling]) {
		const ruler = STATE.getRulerRelation({ state: engine, nation })
		if (ruler)
			STATE.setRelation({
				state: engine,
				a: nation,
				b: ruler.ruler,
				rel: STATE.rel.NONE,
			})
	}
	for (let p = 0; p < engine.P; p++)
		if (!STATE.isSovereign({ state: engine, p }))
			expect(
				STATE.getRulerRelation({ state: engine, nation: p }),
			).toBeUndefined()

	STATE.setRelation({ state: engine, a: r, b: x, rel: STATE.rel.ALLY })
	STATE.setRelation({ state: engine, a: s, b: x, rel: STATE.rel.ALLY })
	STATE.setRelation({ state: engine, a: s, b: y, rel: STATE.rel.ALLY })
	STATE.setRelation({ state: engine, a: s, b: r, rel: STATE.rel.VASSAL })
	expect(STATE.getRelation({ state: engine, a: s, b: x })).toBe(STATE.rel.ALLY)
	expect(STATE.getRelation({ state: engine, a: s, b: y })).toBe(STATE.rel.NONE)
	expect(STATE.diplomaticOverlord({ state: engine, nation: s })).toBe(r)
	expect(
		ROYAL_MARRIAGES.alliable({
			state: engine,
			match: {
				a: engine.people.rulerOf[s],
				b: engine.people.rulerOf[x],
				realmA: s,
				realmB: x,
			},
		}),
	).toBe(true)
	expect(
		ROYAL_MARRIAGES.alliable({
			state: engine,
			match: {
				a: engine.people.rulerOf[s],
				b: engine.people.rulerOf[y],
				realmA: s,
				realmB: y,
			},
		}),
	).toBe(false)

	const before = FIELDS.prov.treasury.get({ state: engine, p: r })
	TAX.previewBudget({ state: engine })
	expect(FIELDS.prov.treasury.get({ state: engine, p: r })).toBe(before)
	engine.time += STATE.yearMs
	TAX.runTax({
		state: engine,
		nation: s,
		previousTime: engine.time - STATE.yearMs,
	})
	const payer = TREASURY_BUDGET.get({ state: engine, p: s })
	const receiver = TREASURY_BUDGET.get({ state: engine, p: r })
	expect(payer.tribute).toBeCloseTo(-0.1 * payer.taxes, 8)
	expect(receiver.tributeReceived).toBeCloseTo(-payer.tribute, 8)
	expect(
		FIELDS.prov.treasury.get({ state: engine, p: r }) - before,
	).toBeCloseTo(-payer.tribute, 8)
	STATE.setDisposition({
		state: engine,
		a: s,
		b: r,
		disposition: STATE.disp.RIVAL,
	})
	engine.time += STATE.yearMs
	TAX.runTax({
		state: engine,
		nation: s,
		previousTime: engine.time - STATE.yearMs,
	})
	expect(TREASURY_BUDGET.get({ state: engine, p: s }).tribute).toBe(0)
	STATE.setDisposition({
		state: engine,
		a: s,
		b: r,
		disposition: STATE.disp.NEUTRAL,
	})

	STATE.setRelation({ state: engine, a: sibling, b: r, rel: STATE.rel.VASSAL })
	expect(STATE.canAlly({ state: engine, a: s, b: sibling })).toBe(true)
	STATE.setRelation({ state: engine, a: s, b: sibling, rel: STATE.rel.ALLY })
	STATE.setRelation({
		state: engine,
		a: sibling,
		b: r,
		rel: STATE.rel.NONE,
	})
	expect(STATE.getRelation({ state: engine, a: s, b: sibling })).toBe(
		STATE.rel.NONE,
	)
	STATE.setRelation({ state: engine, a: y, b: s, rel: STATE.rel.VASSAL })
	STATE.setRelation({ state: engine, a: y, b: x, rel: STATE.rel.ALLY })
	const marriageKey = Math.min(s, x) * engine.P + Math.max(s, x)
	engine.people.marriageAlliances.set(marriageKey, { first: s, second: x })
	STATE.setRelation({ state: engine, a: r, b: x, rel: STATE.rel.NONE })
	expect(STATE.getRelation({ state: engine, a: s, b: x })).toBe(STATE.rel.NONE)
	expect(STATE.getRelation({ state: engine, a: y, b: x })).toBe(STATE.rel.NONE)
	ROYAL_MARRIAGES.review({ state: engine })
	expect(engine.people.marriageAlliances.has(marriageKey)).toBe(false)
	STATE.setRelation({ state: engine, a: r, b: x, rel: STATE.rel.ALLY })
	STATE.setRelation({ state: engine, a: s, b: x, rel: STATE.rel.ALLY })
	STATE.createActiveWar({
		state: engine,
		attacker: r,
		defender: x,
		rng: HISTORY_RNG.createHistoryRng(2718),
	})
	expect(STATE.getRelation({ state: engine, a: s, b: x })).toBe(STATE.rel.NONE)

	STATE.setRelation({ state: engine, a: s, b: r, rel: STATE.rel.NONE })
	STATE.setRelation({ state: engine, a: s, b: r, rel: STATE.rel.PU_JUNIOR })
	expect(STATE.diplomaticOverlord({ state: engine, nation: s })).toBe(-1)
	engine.time += STATE.yearMs
	TAX.runTax({
		state: engine,
		nation: s,
		previousTime: engine.time - STATE.yearMs,
	})
	expect(TREASURY_BUDGET.get({ state: engine, p: s }).tribute).toBe(0)
	STATE.setRelation({ state: engine, a: s, b: r, rel: STATE.rel.NONE })
	STATE.setRelation({ state: engine, a: r, b: s, rel: STATE.rel.COLONY })
	expect(STATE.diplomaticOverlord({ state: engine, nation: s })).toBe(-1)
	engine.time += STATE.yearMs
	TAX.runTax({
		state: engine,
		nation: s,
		previousTime: engine.time - STATE.yearMs,
	})
	expect(TREASURY_BUDGET.get({ state: engine, p: s }).tribute).toBe(0)

	const internal = Array.from({ length: engine.P }, (_, p) => p).find(
		(p) => !engine.desolate[p] && engine.parentCurrent[p] >= 0,
	)
	if (internal === undefined) throw new Error("no internal vassal")
	STATE.releaseProvince({
		state: engine,
		p: internal,
		rng: HISTORY_RNG.createHistoryRng(3141),
		reason: "territorial change",
	})
	expect(
		STATE.getRulerRelation({ state: engine, nation: internal }),
	).toBeUndefined()
})

it("keeps every alliance valid through a short simulation", () => {
	const { engine } = HISTORY_RUN.createEngine({
		seed: 14963992,
		era: "lateMedieval",
		numPoints: 30000,
	})
	SIM_ENGINE.simulateUntil({
		state: engine,
		targetTimeMs: engine.time + 15 * STATE.yearMs,
		rng: HISTORY_RNG.createHistoryRng(14963992 + 99999),
		validate: false,
	})
	for (let a = 0; a < engine.P; a++) {
		if (engine.desolate[a] || !STATE.isSovereign({ state: engine, p: a }))
			continue
		for (const b of engine.relationColumns[a])
			if (
				b > a &&
				STATE.getRelation({ state: engine, a, b }) === STATE.rel.ALLY
			)
				expect(STATE.canAlly({ state: engine, a, b })).toBe(true)
	}
})
