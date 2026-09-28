import { expect, it, vi } from "vitest"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { WAR } from "@/model/history/sim/engine/events/war"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { HISTORY_RUN } from "@/test/history-run"

function setup() {
	const state = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	}).engine
	const rng = HISTORY_RNG.createHistoryRng(1729)
	const attacker = Array.from({ length: state.P }, (_, p) => p).find(
		(p) =>
			!state.desolate[p] &&
			STATE.isSovereign({ state, p }) &&
			state.provinceWars[p].length === 0 &&
			STATE.getNationNeighbors({ state, nation: p }).some(
				(nb) =>
					STATE.isSovereign({ state, p: nb }) &&
					state.provinceWars[nb].length === 0 &&
					STATE.getChildren({ state, p: nb }).length > 0,
			),
	)
	if (attacker === undefined) throw new Error("no neighboring realms")
	const defender = STATE.getNationNeighbors({ state, nation: attacker }).find(
		(nb) =>
			STATE.isSovereign({ state, p: nb }) &&
			state.provinceWars[nb].length === 0 &&
			STATE.getChildren({ state, p: nb }).length > 0,
	)
	if (defender === undefined) throw new Error("no defender")
	const child = STATE.getChildren({ state, p: defender })[0]
	const war = STATE.createActiveWar({ state, attacker, defender, rng })
	return { state, rng, war, child }
}

it("annexes after a capital falls and signs a truce", () => {
	const { state, rng, war } = setup()
	const terms = PEACE.conclude({ state, war, rng, reason: "capital taken" })
	expect(terms.outcome).toBe("annexation")
	expect(STATE.isSovereign({ state, p: war.defender })).toBe(false)
	expect(PEACE.inTruce({ state, a: war.attacker, b: war.defender })).toBe(true)
})

it("calls a full rebel reconquest restoration", () => {
	const { state, rng, war, child } = setup()
	war.rebel = true
	const terms = PEACE.conclude({ state, war, rng, reason: "capital taken" })
	expect(terms.outcome).toBe("restoration")
	expect(terms.transferred).toContain(war.defender)
	expect(terms.transferred).toContain(child)
	expect(STATE.isSovereign({ state, p: war.defender })).toBe(false)
})

it("keeps rebels independent after partial reconquest", () => {
	const { state, rng, war, child } = setup()
	war.rebel = true
	war.occupied.push(child)
	FIELDS.prov.occupation.set({ state, p: child, value: war.idx })
	const terms = PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	expect(terms.outcome).toBe("independence")
	expect(terms.winner).toBe(war.defender)
	expect(terms.transferred).toContain(child)
	expect(STATE.isSovereign({ state, p: war.defender })).toBe(true)
	expect(STATE.getSovereign({ state, p: child })).toBe(war.attacker)
})

it("keeps occupied land in a stalled war and otherwise makes white peace", () => {
	const { state, rng, war, child } = setup()
	war.occupied.push(child)
	FIELDS.prov.occupation.set({ state, p: child, value: war.idx })
	const terms = PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	expect(terms.outcome).toBe("cession")
	expect(terms.transferred).toContain(child)
	const second = STATE.createActiveWar({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
	})
	const white = PEACE.conclude({
		state,
		war: second,
		rng,
		reason: "both exhausted",
	})
	expect(white.outcome).toBe("white peace")
	expect(white.winner).toBe(war.defender)
})

it("pays indemnity from revenue alongside tribute and expires it", () => {
	const { state, rng, war } = setup()
	rng.random = () => 0
	const terms = PEACE.conclude({ state, war, rng, reason: "offensive spent" })
	expect(terms.outcome).toBe("indemnity")
	expect(state.indemnities).toHaveLength(1)
	STATE.setRelation({
		state,
		a: war.attacker,
		b: war.defender,
		rel: STATE.rel.VASSAL,
	})
	state.time += STATE.yearMs
	const before = FIELDS.prov.treasury.get({ state, p: war.defender })
	TAX.runTax({
		state,
		nation: war.attacker,
		previousTime: state.time - STATE.yearMs,
	})
	const payer = TREASURY_BUDGET.get({ state, p: war.attacker })
	const receiver = TREASURY_BUDGET.get({ state, p: war.defender })
	expect(payer.indemnity).toBeCloseTo(-0.1 * payer.taxes)
	expect(payer.tribute).toBeCloseTo(-0.1 * payer.taxes)
	expect(receiver.indemnityReceived).toBeCloseTo(-payer.indemnity)
	expect(
		FIELDS.prov.treasury.get({ state, p: war.defender }) - before,
	).toBeCloseTo(-payer.indemnity - payer.tribute)
	state.time += 5 * STATE.yearMs
	TAX.runTax({
		state,
		nation: war.attacker,
		previousTime: state.time - STATE.yearMs,
	})
	expect(state.indemnities).toHaveLength(0)
	expect(TREASURY_BUDGET.get({ state, p: war.attacker }).indemnity).toBe(0)
	const nextWar = STATE.createActiveWar({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
	})
	PEACE.conclude({ state, war: nextWar, rng, reason: "offensive spent" })
	const third = Array.from({ length: state.P }, (_, p) => p).find(
		(p) =>
			p !== war.attacker &&
			p !== war.defender &&
			STATE.isSovereign({ state, p }),
	)
	if (third === undefined) throw new Error("no third realm")
	FIELDS.prov.parent.set({ state, p: war.defender, value: third })
	state.time += STATE.yearMs
	TAX.runTax({
		state,
		nation: war.attacker,
		previousTime: state.time - STATE.yearMs,
	})
	expect(state.indemnities).toHaveLength(0)
	expect(TREASURY_BUDGET.get({ state, p: war.attacker }).indemnity).toBe(0)
})

it("rolls white peace for an immediately repelled war", () => {
	const { state, rng, war } = setup()
	rng.random = () => 0.99
	const terms = PEACE.conclude({ state, war, rng, reason: "offensive spent" })
	expect(terms.outcome).toBe("white peace")
	expect(state.indemnities).toHaveLength(0)
	const second = STATE.createActiveWar({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
	})
	rng.random = () => 0
	const later = PEACE.conclude({
		state,
		war: second,
		rng,
		reason: "offensive spent",
	})
	expect(later.outcome).toBe("indemnity")
	expect(state.indemnities).toHaveLength(1)
})

it("weights defender indemnities by force advantage", () => {
	const { state, rng, war } = setup()
	rng.random = () => 0.5
	const threat = vi.spyOn(MILITARY, "threat").mockReturnValue(0.5)
	const even = PEACE.conclude({ state, war, rng, reason: "offensive spent" })
	expect(even.outcome).toBe("white peace")
	expect(state.indemnities).toHaveLength(0)
	const second = STATE.createActiveWar({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
	})
	threat.mockReturnValue(0.95)
	const decisive = PEACE.conclude({
		state,
		war: second,
		rng,
		reason: "offensive spent",
	})
	expect(decisive.outcome).toBe("indemnity")
	expect(state.indemnities).toHaveLength(1)
	threat.mockRestore()
})

it("gives rebels independence when they hold out and blocks ordinary renewed war", () => {
	const { state, rng, war } = setup()
	war.rebel = true
	const terms = PEACE.conclude({
		state,
		war,
		rng,
		reason: "occupation restored",
	})
	expect(terms.outcome).toBe("independence")
	expect(terms.winner).toBe(war.defender)
	const count = state.wars.length
	WAR.start({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
		rebel: false,
	})
	expect(state.wars).toHaveLength(count)
	WAR.start({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
		rebel: true,
	})
	expect(state.wars).toHaveLength(count + 1)
})

it("lets the same leaders fight again after the truce expires", () => {
	const { state, rng, war } = setup()
	PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	state.time += STATE.deltaYear(10)
	expect(PEACE.inTruce({ state, a: war.attacker, b: war.defender })).toBe(false)
	const count = state.wars.length
	WAR.start({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
		rebel: false,
	})
	expect(state.wars).toHaveLength(count + 1)
})

it("lapses a war when the attacking realm is absorbed", () => {
	const { state, rng, war, child } = setup()
	const third = Array.from({ length: state.P }, (_, p) => p).find(
		(p) =>
			p !== war.attacker &&
			p !== war.defender &&
			STATE.isSovereign({ state, p }),
	)
	if (third === undefined) throw new Error("no third realm")
	war.occupied.push(child)
	FIELDS.prov.occupation.set({ state, p: child, value: war.idx })
	FIELDS.prov.parent.set({ state, p: war.attacker, value: third })
	const terms = PEACE.conclude({ state, war, rng, reason: "not sovereign" })
	expect(terms.outcome).toBe("lapsed")
	expect(terms.winner).toBe(war.defender)
	expect(terms.transferred).toHaveLength(0)
	expect(STATE.getSovereign({ state, p: child })).toBe(war.defender)
})

it("lets a losing defender buy back occupied provinces", () => {
	const { state, rng } = setup()
	const buyer = Array.from({ length: state.P }, (_, p) => p).find(
		(p) =>
			STATE.isSovereign({ state, p }) &&
			STATE.getNationNeighbors({ state, nation: p }).some(
				(nb) =>
					STATE.isSovereign({ state, p: nb }) &&
					STATE.getChildren({ state, p: nb }).length > 0 &&
					MILITARY.threat({ state, attacker: p, defender: nb }) < 0.01,
			),
	)
	if (buyer === undefined) throw new Error("no stronger neighbor")
	const seller = STATE.getNationNeighbors({ state, nation: buyer }).find(
		(nb) =>
			STATE.isSovereign({ state, p: nb }) &&
			STATE.getChildren({ state, p: nb }).length > 0 &&
			MILITARY.threat({ state, attacker: buyer, defender: nb }) < 0.01,
	)
	if (seller === undefined) throw new Error("no seller")
	const occupied = STATE.getChildren({ state, p: seller })[0]
	const buyWar = STATE.createActiveWar({
		state,
		attacker: buyer,
		defender: seller,
		rng,
	})
	buyWar.occupied.push(occupied)
	FIELDS.prov.occupation.set({ state, p: occupied, value: buyWar.idx })
	FIELDS.prov.treasury.set({ state, p: seller, value: 1e12 })
	const price = PEACE.buyoff({ state, war: buyWar })
	expect(price).toBeGreaterThan(0)
	const random = rng.random
	rng.random = () => 0.99
	expect(PEACE.acceptBuyoff({ state, war: buyWar, rng })).toBe(false)
	rng.random = () => 0
	expect(PEACE.acceptBuyoff({ state, war: buyWar, rng })).toBe(true)
	rng.random = random
	FIELDS.prov.treasury.set({ state, p: seller, value: 0 })
	expect(PEACE.buyoff({ state, war: buyWar })).toBe(0)
	FIELDS.prov.treasury.set({ state, p: seller, value: 1e12 })
	const terms = PEACE.conclude({
		state,
		war: buyWar,
		rng,
		reason: "peace bought",
	})
	expect(terms.outcome).toBe("bought peace")
	expect(terms.payment).toBeCloseTo(price)
	expect(STATE.getSovereign({ state, p: occupied })).toBe(seller)
	expect(TREASURY_BUDGET.get({ state, p: seller }).boughtPeace).toBeCloseTo(
		-price,
	)
	expect(TREASURY_BUDGET.get({ state, p: buyer }).boughtPeace).toBeCloseTo(
		price,
	)
})
