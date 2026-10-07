import { expect, it, vi } from "vitest"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { EVENT_HEAP, EventHeap } from "@/model/history/sim/engine/event-heap"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import { TRUCE } from "@/model/history/sim/engine/events/peace/truce"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import { OVERTHROW } from "@/model/history/sim/engine/events/succession/overthrow"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { WAR } from "@/model/history/sim/engine/events/war"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { MILITARY } from "@/model/history/sim/engine/military"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { PEOPLE } from "@/model/history/sim/people"
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

function setupThrone() {
	const { state, rng, war, child } = setup()
	PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	const crown = war.defender
	const deposed = state.people.rulerOf[crown]
	STATE.releaseProvince({ state, p: child, rng, reason: "rebellion" })
	const claimant = state.people.rulerOf[child]
	const throneWar = STATE.createActiveWar({
		state,
		attacker: child,
		defender: crown,
		rng,
		options: { goal: "throne" },
	})
	MILITARY.mobilize({ state, war: throneWar })
	return { state, rng, war: throneWar, crown, child, claimant, deposed }
}

it("closes a siege exactly once at peace and consumes its queued tick without effects", () => {
	const { state, war, rng } = setup()
	state.heap = new EventHeap()
	const garrison = structuredClone(war.deployed)
	for (const nation of Object.keys(garrison).map(Number)) {
		if (war.participants[nation] !== "defender") delete garrison[nation]
		else {
			garrison[nation].levy *= 0.1
			garrison[nation].regular *= 0.1
		}
	}
	SIEGE.begin({
		state,
		war,
		siege: {
			province: war.defender,
			startTime: state.time,
			phase: 0,
			besieger: war.attacker,
			besiegerSide: "attacker",
			startBesiegerStrength: 1000,
			garrison,
			startGarrison: 100,
			shortages: [],
			breaches: 0,
		},
	})
	expect(state.heap.peekType()).toBe(EVENT_HEAP.evt.SIEGE)
	const heap = structuredClone(state.heap)
	const nextTime = state.heap.peekTime()
	const urban = state.popUrbanCurrent.slice()
	const loot = vi.spyOn(MILITARY, "plunder")
	PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	expect(structuredClone(state.heap)).toEqual(heap)
	expect(loot).not.toHaveBeenCalled()
	expect(state.popUrbanCurrent).toEqual(urban)
	expect(war.siege).toBeNull()
	const endings = state.events.filter(
		(note) => note.tag === "siege ended" && note.data.war === war.idx,
	)
	expect(endings).toHaveLength(1)
	expect(endings[0].data).toMatchObject({
		outcome: "lifted",
		reason: "war ended",
		phases: 0,
	})
	const casualties = structuredClone(state.militaryTotals.casualties)
	const occupation = state.occupationCurrent.slice()
	const random = vi.spyOn(rng, "random")
	random.mockImplementation(() => {
		throw new Error("stale siege consumed randomness")
	})
	SIM_ENGINE.simulateUntil({
		state,
		targetTimeMs: nextTime,
		rng,
		validate: false,
	})
	expect(state.heap.size).toBe(0)
	expect(random).not.toHaveBeenCalled()
	expect(state.militaryTotals.casualties).toEqual(casualties)
	expect(state.occupationCurrent).toEqual(occupation)
	expect(
		state.events.filter(
			(note) => note.tag === "siege ended" && note.data.war === war.idx,
		),
	).toHaveLength(1)
	vi.restoreAllMocks()
}, 120000)

it("enthrones a victorious claimant and preserves a restoration claim", () => {
	const { state, rng, war, crown, child, claimant, deposed } = setupThrone()
	const terms = PEACE.conclude({ state, war, rng, reason: "enforced" })
	expect(terms.outcome).toBe("regime change")
	expect(terms.receiver).toBe(crown)
	expect(state.people.rulerOf[crown]).toBe(claimant)
	expect(state.people.deposed.get(crown)?.claimant).toBe(deposed)
	expect(STATE.isSovereign({ state, p: child })).toBe(false)
})

it("submits a claimant whose offensive ends without land", () => {
	const { state, rng, war, crown, child, claimant } = setupThrone()
	const terms = PEACE.conclude({ state, war, rng, reason: "offensive spent" })
	expect(terms.outcome).toBe("submission")
	expect(state.people.rulerOf[crown]).not.toBe(claimant)
	expect(STATE.isSovereign({ state, p: child })).toBe(false)
	expect(state.people.persons.heldSeats[claimant]).toEqual([])
})

it("joins supporting districts and recalculates both armies independently", () => {
	const { state, rng } = setup()
	let crown = -1
	let seats: number[] = []
	const time = state.time / STATE.yearMs
	for (let p = 0; p < state.P; p++) {
		const ruler = state.people.rulerOf[p]
		if (
			!STATE.isSovereign({ state, p }) ||
			state.provinceWars[p].length > 0 ||
			ruler < 0
		)
			continue
		const eligible = STATE.getChildren({ state, p }).filter((seat) => {
			const holder = state.people.rulerOf[seat]
			return (
				STATE_TITLES.isDistrictSeat({ state, seat }) &&
				holder >= 0 &&
				state.people.persons.heldSeats[holder].includes(seat) &&
				PEOPLE.aliveAt({ people: state.people, person: holder, time })
			)
		})
		if (
			eligible.length < 2 ||
			eligible.some((seat) => state.people.rulerOf[seat] === ruler) ||
			state.people.persons.dynasty[state.people.rulerOf[eligible[0]]] < 0
		)
			continue
		crown = p
		seats = eligible
		break
	}
	if (crown < 0) throw new Error("no realm with supporting districts")
	const claimant = state.people.rulerOf[seats[0]]
	const incumbent = state.people.rulerOf[crown]
	const dynasty = state.people.persons.dynasty[claimant]
	state.people.persons.dynasty[incumbent] = -1
	for (const seat of seats)
		state.people.persons.dynasty[state.people.rulerOf[seat]] = dynasty
	rng.random = () => 0
	const contest = SUCCESSION_SYSTEMS.challenge({
		state,
		realm: crown,
		incumbent,
		claimant,
		rng,
	})
	expect(contest.seat).toBe(seats[0])
	expect(contest.supportingSeats).toEqual(seats)
	const supportingPopulation = seats.reduce(
		(sum, seat) => sum + STATE.getNationPopulation({ state, root: seat }),
		0,
	)
	const levies = state.levyCurrent[crown]
	const regulars = state.regularCurrent[crown]
	const demobilized = { ...state.militaryIntervals.get(crown)!.demobilized }
	const recruited = { ...state.militaryIntervals.get(crown)!.recruited }
	const seeks = vi
		.spyOn(OVERTHROW, "seeks")
		.mockReturnValue(contest.supportingSeats)
	try {
		expect(
			WAR.rebel({
				state,
				overlord: crown,
				subject: contest.seat,
				laxity: 1,
				succession: false,
				rng,
			}),
		).toBe(true)
	} finally {
		seeks.mockRestore()
	}
	for (const seat of seats)
		expect(STATE.getSovereign({ state, p: seat })).toBe(contest.seat)
	expect(STATE.getNationPopulation({ state, root: contest.seat })).toBeCloseTo(
		supportingPopulation,
	)
	const released = state.militaryIntervals.get(contest.seat)!
	const retained = state.militaryIntervals.get(crown)!
	expect(
		state.levyCurrent[contest.seat] +
			state.levyCurrent[crown] +
			released.demobilized.levy +
			retained.demobilized.levy -
			demobilized.levy -
			released.recruited.levy -
			retained.recruited.levy +
			recruited.levy,
	).toBeCloseTo(levies, 5)
	expect(
		state.regularCurrent[contest.seat] +
			state.regularCurrent[crown] +
			released.demobilized.regular +
			retained.demobilized.regular -
			demobilized.regular -
			released.recruited.regular -
			retained.recruited.regular +
			recruited.regular,
	).toBeCloseTo(regulars, 5)
	for (const nation of [crown, contest.seat]) {
		const target = RECRUITMENT.realmTargets({ state, nation })
		expect(state.levyCurrent[nation]).toBeCloseTo(target.levy, 7)
		expect(state.regularCurrent[nation]).toBeCloseTo(target.regular, 7)
	}
	const war = state.wars.at(-1)
	if (!war) throw new Error("no throne war")
	PEACE.conclude({ state, war, rng, reason: "offensive spent" })
	for (const seat of seats)
		expect(STATE.getSovereign({ state, p: seat })).toBe(crown)
})

it("signs a truce with the former crown when a district breaks away without war", () => {
	const { state, rng, war, child } = setup()
	PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	const crown = war.defender
	const active = state.activeWarIds.size
	const seeks = vi.spyOn(OVERTHROW, "seeks").mockReturnValue([])
	try {
		rng.random = () => 0
		expect(
			WAR.rebel({
				state,
				overlord: crown,
				subject: child,
				laxity: 1,
				succession: false,
				rng,
			}),
		).toBe(true)
		expect(STATE.isSovereign({ state, p: child })).toBe(true)
		expect(TRUCE.active({ state, a: crown, b: child })).toBe(true)
		expect(state.activeWarIds.size).toBe(active)
	} finally {
		seeks.mockRestore()
	}
})

it("remembers the original crown ruler when the throne is vacant", () => {
	const { state, rng, war, crown, deposed } = setupThrone()
	PEOPLE.vacate({ people: state.people, seat: crown, reason: "succession" })
	state.people.persons.death[deposed] = state.time / STATE.yearMs - 1
	PEACE.conclude({ state, war, rng, reason: "enforced" })
	expect(state.people.deposed.get(crown)?.claimant).toBe(deposed)
})

it("makes a mid-war usurper the deposed claimant", () => {
	const { state, rng, war, crown } = setupThrone()
	STATE.foundRuler({
		state,
		p: crown,
		age: 35,
		claim: 0,
		rng,
		reason: "usurpation",
	})
	const usurper = state.people.rulerOf[crown]
	PEACE.conclude({ state, war, rng, reason: "enforced" })
	expect(state.people.deposed.get(crown)?.claimant).toBe(usurper)
})

it("lets a disloyal overlord back a throne claimant and keeps the bond after victory", () => {
	const { state, rng, war, child } = setup()
	PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	const crown = war.defender
	const overlord = war.attacker
	state.truces.clear()
	STATE.setRelation({ state, a: crown, b: overlord, rel: STATE.rel.VASSAL })
	STATE.setDisposition({
		state,
		a: crown,
		b: overlord,
		disposition: STATE.disp.RIVAL,
	})
	STATE.releaseProvince({ state, p: child, rng, reason: "rebellion" })
	rng.random = () => 0
	WAR.start({ state, attacker: child, defender: crown, rng, goal: "throne" })
	const throneWar = state.wars.at(-1)
	if (!throneWar) throw new Error("no throne war")
	expect(throneWar.backers).toContain(overlord)
	expect(throneWar.allies.has(overlord)).toBe(true)
	const coalition = state.pendingJournal.coalitions.findLast(
		(entry) => entry.warId === throneWar.idx,
	)
	expect(coalition?.attackers).toContain(overlord)
	expect(coalition?.defenders).not.toContain(overlord)
	const mobilized = state.events.findLast(
		(note) => note.tag === "war mobilized",
	)
	const index = (mobilized?.data.deployedNations as number[]).indexOf(overlord)
	expect((mobilized?.data.deployedRoles as (string | null)[])[index]).toBe(
		"backer",
	)
	const battle = MILITARY.fight({
		state,
		war: throneWar,
		eventAttacker: child,
		attackerMultiplier: 1,
		defenderMultiplier: 1,
		rng,
	})
	const battleIndex = battle.deployments.findIndex(
		(member) => member.nation === overlord,
	)
	expect(battle.roles[battleIndex]).toBe("backer")
	PEACE.conclude({ state, war: throneWar, rng, reason: "enforced" })
	expect(STATE.getRelation({ state, a: crown, b: overlord })).toBe(
		STATE.rel.OVERLORD,
	)
	expect(STATE.getDisposition({ state, a: crown, b: overlord })).toBe(
		STATE.disp.TRUSTED,
	)
})

it("renounces vassalage when the overlord loses with the crown", () => {
	const { state, rng, war, child } = setup()
	PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	const crown = war.defender
	const overlord = war.attacker
	state.truces.clear()
	STATE.setRelation({ state, a: crown, b: overlord, rel: STATE.rel.VASSAL })
	STATE.setDisposition({
		state,
		a: crown,
		b: overlord,
		disposition: STATE.disp.NEUTRAL,
	})
	STATE.releaseProvince({ state, p: child, rng, reason: "rebellion" })
	rng.random = () => 1
	WAR.start({ state, attacker: child, defender: crown, rng, goal: "throne" })
	const throneWar = state.wars.at(-1)
	if (!throneWar) throw new Error("no throne war")
	expect(throneWar.allies.has(overlord)).toBe(true)
	expect(throneWar.backers).not.toContain(overlord)
	PEACE.conclude({ state, war: throneWar, rng, reason: "enforced" })
	expect(STATE.getRelation({ state, a: crown, b: overlord })).toBe(
		STATE.rel.NONE,
	)
	expect(STATE.getDisposition({ state, a: crown, b: overlord })).toBe(
		STATE.disp.SUSPICIOUS,
	)
	expect(state.events).toContainEqual(
		expect.objectContaining({
			tag: "vassalage ended",
			data: expect.objectContaining({
				vassal: crown,
				overlord,
				cause: "regime change",
			}),
		}),
	)
})

it("repays a Rival vassal backer without ending its bond", () => {
	const { state, rng, war, child } = setup()
	PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	const crown = war.defender
	const vassal = war.attacker
	state.truces.clear()
	STATE.setRelation({ state, a: vassal, b: crown, rel: STATE.rel.VASSAL })
	STATE.setDisposition({
		state,
		a: vassal,
		b: crown,
		disposition: STATE.disp.RIVAL,
	})
	STATE.releaseProvince({ state, p: child, rng, reason: "rebellion" })
	rng.random = () => 0
	WAR.start({ state, attacker: child, defender: crown, rng, goal: "throne" })
	const throneWar = state.wars.at(-1)
	if (!throneWar) throw new Error("no throne war")
	expect(throneWar.backers).toContain(vassal)
	const coalition = state.pendingJournal.coalitions.findLast(
		(entry) => entry.warId === throneWar.idx,
	)
	expect(coalition?.attackers).toContain(vassal)
	expect(coalition?.defenders).not.toContain(vassal)
	PEACE.conclude({ state, war: throneWar, rng, reason: "enforced" })
	expect(STATE.getRelation({ state, a: vassal, b: crown })).toBe(
		STATE.rel.OVERLORD,
	)
	expect(STATE.getDisposition({ state, a: vassal, b: crown })).toBe(
		STATE.disp.TRUSTED,
	)
})

it("annexes after a capital falls and signs a truce", () => {
	const { state, rng, war } = setup()
	const terms = PEACE.conclude({ state, war, rng, reason: "enforced" })
	expect(terms.outcome).toBe("annexation")
	expect(STATE.isSovereign({ state, p: war.defender })).toBe(false)
	expect(TRUCE.active({ state, a: war.attacker, b: war.defender })).toBe(true)
})

it("keeps formal ties and shared dispositions independent", () => {
	const { state, war } = setup()
	STATE.setRelation({
		state,
		a: war.attacker,
		b: war.defender,
		rel: STATE.rel.ALLY,
	})
	STATE.setDisposition({
		state,
		a: war.attacker,
		b: war.defender,
		disposition: STATE.disp.RIVAL,
	})
	expect(STATE.getRelation({ state, a: war.attacker, b: war.defender })).toBe(
		STATE.rel.ALLY,
	)
	expect(
		STATE.getDisposition({ state, a: war.defender, b: war.attacker }),
	).toBe(STATE.disp.RIVAL)
	STATE.setRelation({
		state,
		a: war.attacker,
		b: war.defender,
		rel: STATE.rel.NONE,
	})
	expect(
		STATE.getDisposition({ state, a: war.attacker, b: war.defender }),
	).toBe(STATE.disp.RIVAL)
	expect(state.relationColumns[war.attacker].has(war.defender)).toBe(true)
})

it("calls a full rebel reconquest restoration", () => {
	const { state, rng, war, child } = setup()
	war.goal = "independence"
	const terms = PEACE.conclude({ state, war, rng, reason: "enforced" })
	expect(terms.outcome).toBe("restoration")
	expect(terms.transferred).toContain(war.defender)
	expect(terms.transferred).toContain(child)
	expect(STATE.isSovereign({ state, p: war.defender })).toBe(false)
})

it("keeps rebels independent after partial reconquest", () => {
	const { state, rng, war, child } = setup()
	war.goal = "independence"
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
	war.goal = "independence"
	const terms = PEACE.conclude({
		state,
		war,
		rng,
		reason: "defended",
	})
	expect(terms.outcome).toBe("independence")
	expect(terms.winner).toBe(war.defender)
	const count = state.wars.length
	WAR.start({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
		goal: "conquest",
	})
	expect(state.wars).toHaveLength(count)
	WAR.start({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
		goal: "independence",
	})
	expect(state.wars).toHaveLength(count + 1)
})

it("lets the same leaders fight again after the truce expires", () => {
	const { state, rng, war } = setup()
	PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	state.time += STATE.deltaYear(10)
	expect(TRUCE.active({ state, a: war.attacker, b: war.defender })).toBe(false)
	const count = state.wars.length
	WAR.start({
		state,
		attacker: war.attacker,
		defender: war.defender,
		rng,
		goal: "conquest",
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
