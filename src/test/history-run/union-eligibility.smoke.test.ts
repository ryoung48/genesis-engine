import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { HISTORY_RUN } from "@/test/history-run"
import { HISTORY_VALIDATION } from "@/test/history-run/report/validation"

let state: HistoryState
let realms: number[]

function endWars(): void {
	for (const idx of [...state.activeWarIds])
		STATE.resolveWar({
			state,
			war: state.wars[idx],
			transferred: [],
			receiver: state.wars[idx].attacker,
		})
}

function setGovernment(
	p: number,
	government: "feudal_monarchy" | "elective_monarchy",
) {
	state.governmentType[p] = GOVERNMENT.getGovIdx()[government]
}

function unlink(a: number, b: number): void {
	STATE.setRelation({ state, a, b, rel: STATE.rel.NONE })
}

beforeAll(() => {
	state = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	}).engine
	endWars()
	realms = Array.from({ length: state.P }, (_, p) => p).filter(
		(p) =>
			!state.desolate[p] &&
			STATE.isSovereign({ state, p }) &&
			state.people.rulerOf[p] >= 0 &&
			!STATE.getRulerRelation({ state, nation: p }),
	)
}, 120000)

afterEach(() => {
	endWars()
})

describe("new union links", () => {
	it("need two single-heir realms and keep an existing link whatever its government", () => {
		const [a, b] = realms.filter(
			(p, i) =>
				i < 2 &&
				STATE.getRelation({ state, a: p, b: realms[0] }) !== STATE.rel.WAR,
		)
		setGovernment(a, "feudal_monarchy")
		setGovernment(b, "feudal_monarchy")
		expect(STATE.canUnite({ state, a, b })).toBe(true)
		setGovernment(b, "elective_monarchy")
		expect(STATE.canUnite({ state, a, b })).toBe(false)
		expect(STATE.canUniteAfterWar({ state, a, b })).toBe(false)
		setGovernment(b, "feudal_monarchy")
		STATE.setRelation({ state, a: b, b: a, rel: STATE.rel.PU_JUNIOR })
		setGovernment(b, "elective_monarchy")
		expect(STATE.canUnite({ state, a, b })).toBe(true)
		unlink(a, b)
	})

	it("refuse an heir whose own crown is elective", () => {
		const [realm, other] = realms
		setGovernment(realm, "feudal_monarchy")
		setGovernment(other, "feudal_monarchy")
		const person = state.people.rulerOf[other]
		expect(SUCCESSION_SYSTEMS.inheritable({ state, realm, person })).toBe(true)
		setGovernment(other, "elective_monarchy")
		expect(SUCCESSION_SYSTEMS.inheritable({ state, realm, person })).toBe(false)
		setGovernment(other, "feudal_monarchy")
	})
})

describe("inheritance across a war for a throne", () => {
	it("is closed in both directions while the war runs and reopens after it", () => {
		const [rebel, crown, third] = realms
		for (const p of [rebel, crown, third]) setGovernment(p, "feudal_monarchy")
		const claimant = state.people.rulerOf[rebel]
		expect(
			SUCCESSION_SYSTEMS.inheritable({ state, realm: third, person: claimant }),
		).toBe(true)
		expect(
			SUCCESSION_SYSTEMS.inheritable({ state, realm: crown, person: claimant }),
		).toBe(true)
		const war = STATE.createActiveWar({
			state,
			attacker: rebel,
			defender: crown,
			rng: HISTORY_RNG.createHistoryRng(3),
			options: { goal: "throne" },
		})
		expect(STATE.isPressing({ state, p: rebel })).toBe(true)
		expect(
			SUCCESSION_SYSTEMS.inheritable({ state, realm: third, person: claimant }),
		).toBe(false)
		const outsider = state.people.rulerOf[third]
		expect(
			SUCCESSION_SYSTEMS.inheritable({ state, realm: rebel, person: outsider }),
		).toBe(false)
		STATE.resolveWar({ state, war, transferred: [], receiver: rebel })
		unlink(rebel, crown)
		expect(
			SUCCESSION_SYSTEMS.inheritable({ state, realm: third, person: claimant }),
		).toBe(true)
	})
})

describe("juniors that lose their senior", () => {
	it("stay together under the larger one with their counters", () => {
		const [senior, first, second] = realms
		const ruler = state.people.rulerOf[first]
		PEOPLE.setRuler({
			people: state.people,
			person: ruler,
			seat: second,
			rank: state.seatRank[second],
			reason: "unknown",
		})
		for (const junior of [first, second]) {
			STATE.setRelation({
				state,
				a: junior,
				b: senior,
				rel: STATE.rel.PU_JUNIOR,
			})
			state.people.unionGenerations.set(junior, 2)
		}
		const before = state.events.length
		STATE.releaseSubjectRelations({ state, nation: senior })
		expect(STATE.unionSenior({ state, p: first })).toBe(
			STATE.unionSenior({ state, p: second }),
		)
		expect(STATE.unionSenior({ state, p: first })).not.toBe(senior)
		const notes = state.events
			.slice(before)
			.filter((note) => note.tag === "personal union continued")
		expect(notes).toHaveLength(1)
		const junior = notes[0].data.juniors as number[]
		expect(state.people.unionGenerations.get(junior[0])).toBe(2)
		expect(
			state.people.unionGenerations.has(notes[0].data.senior as number),
		).toBe(false)
		const tracker = HISTORY_VALIDATION.tracker()
		HISTORY_VALIDATION.unions({ engine: state, tracker })
		expect(tracker.violations).toEqual({})
		unlink(first, second)
	})
})

describe("validation", () => {
	it("flags one person ruling two realms outside a union group", () => {
		const [a, b] = realms
		unlink(a, b)
		const ruler = state.people.rulerOf[a]
		PEOPLE.setRuler({
			people: state.people,
			person: ruler,
			seat: b,
			rank: state.seatRank[b],
			reason: "unknown",
		})
		const tracker = HISTORY_VALIDATION.tracker()
		HISTORY_VALIDATION.unions({ engine: state, tracker })
		expect(tracker.violations["ruler of realms outside one union group"]).toBe(
			1,
		)
	})
})
