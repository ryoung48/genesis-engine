import { expect, it, vi } from "vitest"
import { PEOPLE_RECORD } from "@/model/history/record/people"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import { DERIVE } from "@/model/history/sim/engine/derive"
import { EventHeap } from "@/model/history/sim/engine/event-heap"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { DEATH_SCHEDULE } from "@/model/history/sim/engine/events/people/death/schedule"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { ROYAL_MARRIAGES } from "@/model/history/sim/engine/events/people/royal-marriages"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { HOLDINGS } from "@/model/history/sim/people/holdings"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { RNG } from "@/model/shared/random/rng"
import { HISTORY_RUN } from "@/test/history-run"

function fixture(): HistoryState {
	const people = PEOPLE.create(6)
	const state = {
		people,
		time: 100 * STATE.yearMs,
		heap: new EventHeap(),
		deathSchedule: DEATH_SCHEDULE.create(),
	} as HistoryState
	people.holdingsChanged = (person) =>
		DEATH_SCHEDULE.ensure({ state, person, cause: "natural" })
	for (let id = 0; id < 3; id++) {
		PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people,
			sex: 0,
			birth: 80,
			survives: 80,
			father: -1,
			mother: -1,
			dynasty: id,
			origin: { realm: 0, culture: 0, genderSystem: 0 },
			rng: RNG.createRng({ seed: id + 1 }),
		})
		people.persons.death[id] = 150
	}
	return state
}

it("reconciles sorted holdings on replacement and preserves the other seats", () => {
	const { people } = fixture()
	for (const seat of [4, 2, 3, 2])
		PEOPLE.setRuler({ people, person: 0, seat, rank: 2, reason: "unknown" })
	expect(people.persons.heldSeats[0]).toEqual([2, 3, 4])
	expect(people.persons.heldSeats[1]).not.toBe(people.persons.heldSeats[2])
	const ranks = [0, 0, 2, 3, 3]
	expect(HOLDINGS.primary({ people, person: 0, ranks })).toBe(3)
	PEOPLE.setRuler({ people, person: 1, seat: 3, rank: 3, reason: "succession" })
	expect(people.persons.heldSeats[0]).toEqual([2, 4])
	expect(people.persons.heldSeats[1]).toEqual([3])
	PEOPLE.vacate({ people, seat: 2, reason: "union" })
	expect(people.persons.heldSeats[0]).toEqual([4])
	expect(people.rulerOf[2]).toBe(-1)
	ranks[2] = 4
	expect(HOLDINGS.ordered({ people, person: 0, ranks })).toEqual([4])
})

it("deduplicates schedules, replaces shortened death and consumes once", () => {
	const state = fixture()
	for (const seat of [2, 3])
		PEOPLE.setRuler({
			people: state.people,
			person: 0,
			seat,
			rank: 2,
			reason: "unknown",
		})
	const first = state.deathSchedule.pending.get(0)
	expect(state.heap.size).toBe(1)
	DEATH_SCHEDULE.ensure({ state, person: 0, cause: "natural" })
	expect(state.heap.size).toBe(1)
	PEOPLE.vacate({ people: state.people, seat: 2, reason: "union" })
	expect(state.deathSchedule.pending.get(0)).toBe(first)
	PEOPLE.shortenLife({ people: state.people, person: 0, time: 120 })
	DEATH_SCHEDULE.ensure({ state, person: 0, cause: "natural" })
	const replacement = state.deathSchedule.pending.get(0)
	expect(replacement?.revision).toBeGreaterThan(first?.revision ?? 0)
	state.time = 120 * STATE.yearMs
	expect(
		DEATH_SCHEDULE.consume({
			state,
			person: 0,
			revision: first?.revision ?? -1,
		}),
	).toBeNull()
	expect(
		DEATH_SCHEDULE.consume({
			state,
			person: 0,
			revision: replacement?.revision ?? -1,
		}),
	).toBe("natural")
	DEATH_SCHEDULE.ensure({ state, person: 0, cause: "natural" })
	expect(state.heap.size).toBe(2)
	expect(
		DEATH_SCHEDULE.consume({
			state,
			person: 0,
			revision: replacement?.revision ?? -1,
		}),
	).toBeNull()
	DEATH_SCHEDULE.finish({ state, person: 0 })
	expect(DEATH_SCHEDULE.applied({ state, person: 0 })).toBe(true)
	PEOPLE.vacate({ people: state.people, seat: 3, reason: "union" })
	DEATH_SCHEDULE.ensure({ state, person: 0, cause: "natural" })
	expect(state.deathSchedule.pending.has(0)).toBe(false)
	expect(state.heap.size).toBe(2)
})

it("keeps one finite death token through last-seat loss and reacquisition", () => {
	const state = fixture()
	PEOPLE.setRuler({
		people: state.people,
		person: 0,
		seat: 2,
		rank: 2,
		reason: "unknown",
	})
	const old = state.deathSchedule.pending.get(0)
	PEOPLE.vacate({ people: state.people, seat: 2, reason: "union" })
	expect(state.deathSchedule.pending.get(0)).toBe(old)
	PEOPLE.setRuler({
		people: state.people,
		person: 0,
		seat: 3,
		rank: 2,
		reason: "unknown",
	})
	expect(state.deathSchedule.pending.get(0)).toBe(old)
	expect(state.heap.size).toBe(1)
	state.people.persons.death[1] = Infinity
	DEATH_SCHEDULE.ensure({ state, person: 1, cause: "natural" })
	expect(state.deathSchedule.pending.has(1)).toBe(false)
	expect(state.heap.size).toBe(1)
	state.people.persons.death[1] = 150
	DEATH_SCHEDULE.ensure({ state, person: 1, cause: "natural" })
	DEATH_SCHEDULE.ensure({ state, person: 1, cause: "natural" })
	expect(state.heap.size).toBe(2)
	state.people.persons.death[1] = Infinity
	DEATH_SCHEDULE.ensure({ state, person: 1, cause: "natural" })
	expect(state.deathSchedule.pending.has(1)).toBe(false)
})

for (const order of [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0],
]) {
	it(`continues senior and sibling-junior union edges once in order ${order}`, () => {
		const { engine: state } = HISTORY_RUN.createEngine({
			seed: 14963991,
			era: "lateMedieval",
			numPoints: 10000,
		})
		const crowns: number[] = []
		for (let seat = 0; seat < state.P && crowns.length < 4; seat++) {
			if (
				!STATE.isSovereign({ state, p: seat }) ||
				state.provinceWars[seat].length > 0
			)
				continue
			if (
				crowns.some((other) =>
					STATE.getNationNeighbors({ state, nation: other }).includes(seat),
				)
			)
				continue
			crowns.push(seat)
		}
		expect(crowns).toHaveLength(4)
		for (const crown of crowns) {
			for (const other of [...state.relationColumns[crown]])
				STATE.setRelation({ state, a: crown, b: other, rel: STATE.rel.NONE })
			state.governmentType[crown] = GOVERNMENT.getGovIdx().feudal_monarchy
		}
		const rng = RNG.createRng({ seed: 771 })
		const dying = PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people: state.people,
			sex: 0,
			birth: state.time / STATE.yearMs - 50,
			survives: state.time / STATE.yearMs - 50,
			father: -1,
			mother: -1,
			dynasty: -1,
			origin: STATE.originOf({ state, realm: crowns[0] }),
			rng,
		})
		const heir = PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people: state.people,
			sex: 0,
			birth: state.time / STATE.yearMs - 25,
			survives: state.time / STATE.yearMs - 25,
			father: dying,
			mother: -1,
			dynasty: -1,
			origin: STATE.originOf({ state, realm: crowns[0] }),
			rng,
		})
		state.people.persons.death[dying] = state.time / STATE.yearMs + 1
		state.people.persons.death[heir] = state.time / STATE.yearMs + 50
		for (const crown of crowns.slice(0, 3))
			PEOPLE.setRuler({
				people: state.people,
				seat: crown,
				person: dying,
				rank: 2,
				reason: "unknown",
			})
		STATE.setRelation({
			state,
			a: crowns[1],
			b: crowns[0],
			rel: STATE.rel.PU_JUNIOR,
		})
		STATE.setRelation({
			state,
			a: crowns[2],
			b: crowns[0],
			rel: STATE.rel.PU_JUNIOR,
		})
		for (const junior of crowns.slice(1, 3))
			state.people.unionGenerations.set(junior, 1)
		for (let index = 0; index < order.length; index++)
			state.seatRank[crowns[order[index]]] = 4 - index
		state.time += STATE.yearMs
		const choices = vi
			.spyOn(SUCCESSION_SYSTEMS, "choose")
			.mockImplementation(({ realm }) => {
				expect(
					SUCCESSION_SYSTEMS.inheritable({ state, realm, person: heir }),
				).toBe(true)
				return {
					heir,
					claim: 3,
					pretender: -1,
					pretenderSeat: -1,
					supportingSeats: [],
				}
			})
		try {
			const revision = state.deathSchedule.pending.get(dying)?.revision ?? -1
			PERSON_DEATH.run({ state, person: dying, revision, rng })
			expect(state.people.persons.heldSeats[dying]).toEqual([])
			expect(state.people.persons.heldSeats[heir]).toEqual(
				crowns.slice(0, 3).sort((a, b) => a - b),
			)
			expect(state.people.unionGenerations.get(crowns[1])).toBe(2)
			expect(state.people.unionGenerations.get(crowns[2])).toBe(2)
			expect(STATE.getRelation({ state, a: crowns[1], b: crowns[2] })).toBe(
				STATE.rel.NONE,
			)
			expect(
				state.events.filter((event) => event.tag === "personal union ended"),
			).toHaveLength(0)
			PERSON_DEATH.run({ state, person: dying, revision, rng })
			expect(choices).toHaveBeenCalledTimes(3)
			PEOPLE.setRuler({
				people: state.people,
				seat: crowns[3],
				person: heir,
				rank: 2,
				reason: "unknown",
			})
			STATE.setRelation({
				state,
				a: crowns[3],
				b: crowns[1],
				rel: STATE.rel.WAR,
			})
			PEOPLE.vacate({
				people: state.people,
				seat: crowns[1],
				reason: "unknown",
			})
			expect(
				SUCCESSION_SYSTEMS.inheritable({
					state,
					realm: crowns[1],
					person: heir,
				}),
			).toBe(false)

			PEOPLE.vacate({
				people: state.people,
				seat: crowns[3],
				reason: "unknown",
			})
			STATE.setRelation({
				state,
				a: crowns[3],
				b: crowns[1],
				rel: STATE.rel.NONE,
			})
			PEOPLE.setRuler({
				people: state.people,
				seat: crowns[1],
				person: heir,
				rank: state.seatRank[crowns[1]],
				reason: "unknown",
			})
			const successor = PEOPLE.spawn({
				recordHealth: true,
				death: null,
				nameSeed: null,
				people: state.people,
				sex: 0,
				birth: state.time / STATE.yearMs - 25,
				survives: state.time / STATE.yearMs - 25,
				father: heir,
				mother: -1,
				dynasty: -1,
				origin: STATE.originOf({ state, realm: crowns[0] }),
				rng,
			})
			state.people.persons.death[successor] = state.time / STATE.yearMs + 50
			state.people.persons.death[heir] = state.time / STATE.yearMs + 1
			DEATH_SCHEDULE.ensure({ state, person: heir, cause: "natural" })
			choices.mockImplementation(() => ({
				heir: successor,
				claim: 3,
				pretender: -1,
				pretenderSeat: -1,
				supportingSeats: [],
			}))
			const offset = new Int32Array(state.P + 1)
			const list: number[] = []
			for (let seat = 0; seat < state.P; seat++) {
				offset[seat] = list.length
				if (crowns.slice(0, 3).includes(seat))
					list.push(...crowns.slice(0, 3).filter((other) => other !== seat))
			}
			offset[state.P] = list.length
			const neighbors = vi
				.spyOn(DERIVE, "nationAdjacency")
				.mockReturnValue({ offset, list: Int32Array.from(list) })
			state.time += STATE.yearMs
			try {
				PERSON_DEATH.run({
					state,
					person: heir,
					revision: state.deathSchedule.pending.get(heir)?.revision ?? -1,
					rng,
				})
				expect(state.people.unionGenerations.has(crowns[1])).toBe(false)
				expect(state.people.unionGenerations.has(crowns[2])).toBe(false)
				expect(state.people.persons.heldSeats[successor]).toEqual([crowns[0]])
				expect(
					state.events.filter((event) => event.tag === "personal union merged"),
				).toHaveLength(2)
				expect(choices.mock.calls.length).toBeLessThanOrEqual(6)
			} finally {
				neighbors.mockRestore()
			}

			const spouse = PEOPLE.spawn({
				recordHealth: true,
				death: null,
				nameSeed: null,
				people: state.people,
				sex: 1,
				birth: state.time / STATE.yearMs - 25,
				survives: state.time / STATE.yearMs - 25,
				father: -1,
				mother: -1,
				dynasty: -1,
				origin: STATE.originOf({ state, realm: crowns[3] }),
				rng,
			})
			state.people.persons.death[spouse] = state.time / STATE.yearMs + 50
			PEOPLE.setRuler({
				people: state.people,
				person: spouse,
				seat: crowns[3],
				rank: state.seatRank[crowns[3]],
				reason: "unknown",
			})
			state.people.persons.spouse[successor] = spouse
			state.people.persons.spouse[spouse] = successor
			STATE.uniteCouple({ state, p: crowns[0], person: successor })
			const junior =
				STATE.unionSenior({ state, p: crowns[0] }) === crowns[0]
					? crowns[3]
					: crowns[0]
			expect(state.people.unionGenerations.get(junior)).toBe(1)
			STATE.uniteCouple({ state, p: crowns[0], person: successor })
			expect(state.people.unionGenerations.get(junior)).toBe(1)
			expect(state.people.persons.heldSeats[spouse]).toEqual([crowns[3]])
			expect(state.people.persons.heldSeats[successor]).toEqual([crowns[0]])
		} finally {
			choices.mockRestore()
		}
	}, 60000)
}

it("retains birth-effective residence through moves, sealing, corrections and a dead mother", () => {
	const state = fixture()
	const people = state.people
	people.household = {
		heritageOfCulture: () => -1,
		religionOfRealm: () => -1,
		time: () => state.time / STATE.yearMs,
		ranks: () => [0, 0, 2, 3, 1, 1],
		realmOf: (province) => (province < 2 ? 0 : province),
	}
	const mother = 0
	people.persons.sex[mother] = 1
	PEOPLE.setRuler({ people, person: 1, seat: 4, rank: 1, reason: "unknown" })
	people.persons.spouse[mother] = 1
	people.persons.spouse[1] = mother
	const spawn = (birth: number) =>
		PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people,
			sex: 0,
			birth,
			survives: birth,
			father: 1,
			mother,
			dynasty: 0,
			origin: { realm: 0, culture: 0, genderSystem: 0 },
			rng: RNG.createRng({ seed: 71 }),
		})
	const child = spawn(95)
	people.persons.death[child] = 150
	HOUSEHOLD.relocate({ people, person: mother, province: 2, time: 100 })
	expect(people.persons.residence[child]).toBe(2)
	expect(people.persons.residence[1]).toBe(4)
	expect(people.persons.residence[2]).toBe(0)
	const record = PEOPLE_RECORD.create()
	const packet = PEOPLE_LOG.seal({ people, sovereign: () => true })
	expect(packet.initialResidence[mother]).toBe(0)
	const retained = people.residenceHistory.get(mother)
	const before = retained?.times.slice()
	const received = structuredClone(packet, {
		transfer: Object.values(packet)
			.filter((column) => ArrayBuffer.isView(column))
			.map((column) => (column as Float64Array).buffer),
	})
	expect(retained?.times).toEqual(before)
	expect(retained?.times.byteLength).toBeGreaterThan(0)
	PEOPLE_RECORD.append({
		record,
		packet: received,
		timeMs: 100,
		recordTime: (time) => time,
	})
	state.time = 101 * STATE.yearMs
	HOUSEHOLD.relocate({ people, person: mother, province: 3, time: 101 })
	HOUSEHOLD.relocate({ people, person: mother, province: 4, time: 101 })
	HOUSEHOLD.relocate({ people, person: mother, province: 5, time: 99 })
	expect(people.persons.residence[mother]).toBe(4)
	expect(() =>
		HOUSEHOLD.relocate({ people, person: child, province: 3, time: 94 }),
	).toThrow()
	people.persons.death[mother] = 103
	const early = spawn(98)
	const middle = spawn(100.5)
	const late = spawn(101.5)
	expect(people.persons.initialResidence[early]).toBe(0)
	expect(people.persons.initialResidence[middle]).toBe(2)
	expect(people.persons.initialResidence[late]).toBe(4)
	PEOPLE_RECORD.append({
		record,
		packet: PEOPLE_LOG.seal({ people, sovereign: () => true }),
		timeMs: 101,
		recordTime: (time) => time,
	})
	for (const person of [mother, child, early, middle, late])
		for (const time of [79, 98, 99, 100, 100.5, 101, 102, 105])
			expect(
				PERSON_QUERY.residenceAt({ people: record, id: person, timeMs: time }),
			).toBe(HOUSEHOLD.residenceAt({ people, person, time }))
	expect(people.residenceHistory.get(mother)).toBe(retained)
})

it("succeeds a district-only holder at death before settlement and never repeats it", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const seat = Array.from(state.people.rulerOf.keys()).find((seat) =>
		STATE_TITLES.isDistrictSeat({ state, seat }),
	)
	if (seat === undefined) throw new Error("Missing district")
	const rng = RNG.createRng({ seed: 71 })
	const time = state.time / STATE.yearMs
	const holder = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people: state.people,
		sex: 0,
		birth: time - 50,
		survives: time - 50,
		father: -1,
		mother: -1,
		dynasty: -1,
		origin: STATE.originOf({ state, realm: seat }),
		rng,
	})
	const heir = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people: state.people,
		sex: 0,
		birth: time - 25,
		survives: time - 25,
		father: holder,
		mother: -1,
		dynasty: -1,
		origin: STATE.originOf({ state, realm: seat }),
		rng,
	})
	state.people.persons.death[holder] = time + 0.25
	state.people.persons.death[heir] = time + 40
	DISTRICTS.install({ state, seat, person: holder, reason: "unknown" })
	const revision = state.deathSchedule.pending.get(holder)?.revision ?? -1
	state.time += STATE.yearMs / 4
	PERSON_DEATH.run({ state, person: holder, revision, rng })
	expect(state.people.rulerOf[seat]).toBe(heir)
	expect(state.people.persons.heldSeats[holder]).toEqual([])
	const rows = state.people.log.count
	DISTRICTS.settle({ state, rng })
	PERSON_DEATH.run({ state, person: holder, revision, rng })
	expect(state.people.rulerOf[seat]).toBe(heir)
	expect(state.people.log.count).toBe(rows)
}, 60000)

it("weights each local district, keeps repeated nomination slots and uses the strongest local backer", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const realm = Array.from(state.people.rulerOf.keys()).find(
		(root) =>
			STATE.isSovereign({ state, p: root }) &&
			STATE.getChildren({ state, p: root }).filter((seat) =>
				STATE_TITLES.isDistrictSeat({ state, seat }),
			).length >= 4,
	)
	if (realm === undefined) throw new Error("Missing electoral districts")
	const seats = STATE.getChildren({ state, p: realm })
		.filter((seat) => STATE_TITLES.isDistrictSeat({ state, seat }))
		.sort((a, b) => a - b)
		.slice(0, 4)
	for (const seat of STATE.getChildren({ state, p: realm }))
		if (!seats.includes(seat) && STATE_TITLES.isDistrictSeat({ state, seat }))
			PEOPLE.vacate({ people: state.people, seat, reason: "unknown" })
	const rng = RNG.createRng({ seed: 991 })
	const time = state.time / STATE.yearMs
	const persons = [0, 1, 2].map((dynasty) =>
		PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people: state.people,
			sex: 0,
			birth: time - 30,
			survives: time - 30,
			father: -1,
			mother: -1,
			dynasty: 10000 + dynasty,
			origin: STATE.originOf({ state, realm }),
			rng,
		}),
	)
	for (const person of persons) state.people.persons.death[person] = time + 50
	for (let index = 0; index < seats.length; index++)
		DISTRICTS.install({
			state,
			seat: seats[index],
			person: persons[index < 2 ? 0 : index - 1],
			reason: "unknown",
		})
	const weights = new Map(
		seats.map((seat, index) => [seat, [100, 90, 80, 70][index]]),
	)
	const population = vi
		.spyOn(STATE, "getNationPopulation")
		.mockImplementation(({ root }) => weights.get(root) ?? 0)
	const preference = vi.spyOn(PEOPLE, "preference").mockReturnValue("none")
	const strength = vi.spyOn(GOVERNOR, "candidateStrength").mockReturnValue(0)
	const foreign = Array.from(state.people.rulerOf.keys()).find(
		(seat) =>
			state.parentCurrent[seat] !== realm &&
			STATE_TITLES.isDistrictSeat({ state, seat }),
	)
	if (foreign === undefined) throw new Error("Missing foreign district")
	for (const seat of seats) state.seatRank[seat] = 1
	state.seatRank[foreign] = 4
	PEOPLE.setRuler({
		people: state.people,
		person: persons[0],
		seat: foreign,
		rank: 4,
		reason: "unknown",
	})
	expect(
		HOLDINGS.primary({
			people: state.people,
			person: persons[0],
			ranks: state.seatRank,
		}),
	).toBe(foreign)

	state.people.persons.death[state.people.rulerOf[realm]] = time
	state.people.persons.children[state.people.rulerOf[realm]] = []
	state.people.persons.father[state.people.rulerOf[realm]] = -1
	state.people.persons.mother[state.people.rulerOf[realm]] = -1
	state.governmentType[realm] = GOVERNMENT.getGovIdx().elective_monarchy
	try {
		expect(
			SUCCESSION_SYSTEMS.localDistrict({ state, realm, person: persons[0] }),
		).toBe(seats[0])
		const choice = SUCCESSION_SYSTEMS.choose({
			state,
			realm,
			dying: state.people.rulerOf[realm],
			rng,
		})
		expect(choice.heir).toBe(persons[0])
		weights.set(seats[2], 150)
		expect(
			SUCCESSION_SYSTEMS.choose({
				state,
				realm,
				dying: state.people.rulerOf[realm],
				rng,
			}).heir,
		).toBe(persons[1])
		weights.set(seats[2], 80)
		weights.set(seats[0], 90)
		expect(
			SUCCESSION_SYSTEMS.localDistrict({ state, realm, person: persons[0] }),
		).toBe(seats[0])
		weights.set(seats[0], 100)

		const random = vi.spyOn(rng, "random").mockReturnValue(0)
		const challenge = SUCCESSION_SYSTEMS.challenge({
			state,
			realm,
			incumbent: persons[2],
			claimant: persons[0],
			rng,
		})
		expect(challenge.seat).toBe(seats[0])
		expect(challenge.supportingSeats).toEqual([seats[0], seats[1], seats[2]])
		random.mockRestore()
		PEOPLE.vacate({ people: state.people, seat: seats[0], reason: "unknown" })
		expect(
			SUCCESSION_SYSTEMS.localDistrict({ state, realm, person: persons[0] }),
		).toBe(seats[1])
		state.governmentType[realm] = GOVERNMENT.getGovIdx().oligarchic_republic
		state.people.patricians.set(realm, [
			persons[0],
			persons[1],
			persons[1],
			persons[2],
		])
		expect(
			SUCCESSION_SYSTEMS.choose({
				state,
				realm,
				dying: state.people.rulerOf[realm],
				rng,
			}).heir,
		).toBe(persons[0])
	} finally {
		strength.mockRestore()
		population.mockRestore()
		preference.mockRestore()
	}
}, 60000)

it("rechecks a marriage alliance after relocation releases its sustaining betrothal", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const crowns = Array.from(state.people.rulerOf.keys())
		.filter((p) => !state.desolate[p] && STATE.isSovereign({ state, p }))
		.slice(0, 3)
	const time = state.time / STATE.yearMs
	const rng = RNG.createRng({ seed: 91 })
	for (const member of PEOPLE.family({
		people: state.people,
		person: state.people.rulerOf[crowns[0]],
	})) {
		state.people.persons.spouse[member] = -1
		state.people.persons.betrothed[member] = -1
	}
	for (const crown of crowns) {
		state.governmentType[crown] = GOVERNMENT.getGovIdx().feudal_monarchy
		for (const other of [...state.relationColumns[crown]])
			STATE.setRelation({ state, a: crown, b: other, rel: STATE.rel.NONE })
	}
	const children = crowns.slice(0, 2).map((realm, sex) =>
		PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people: state.people,
			sex: sex === 0 ? 0 : 1,
			birth: time - 13,
			survives: time - 13,
			father: state.people.rulerOf[realm],
			mother: -1,
			dynasty: -1,
			origin: STATE.originOf({ state, realm }),
			rng,
		}),
	)
	for (const child of children) state.people.persons.death[child] = time + 50
	BETROTHAL.betroth({
		people: state.people,
		a: children[0],
		b: children[1],
		time,
	})
	expect(
		ROYAL_MARRIAGES.allianceFromMatch({
			state,
			match: {
				a: children[0],
				b: children[1],
				realmA: crowns[0],
				realmB: crowns[1],
			},
		}),
	).toBe(true)
	HOUSEHOLD.relocate({
		people: state.people,
		person: children[0],
		province: crowns[2],
		time,
	})
	ROYAL_MARRIAGES.review({ state })
	expect(state.people.persons.betrothed[children[0]]).toBe(-1)
	expect(
		state.people.marriageAlliances.has(
			Math.min(crowns[0], crowns[1]) * state.P + Math.max(crowns[0], crowns[1]),
		),
	).toBe(false)
}, 60000)

it("weddings and title loss preserve separate landed households", () => {
	const { people } = fixture()
	people.household = {
		heritageOfCulture: () => -1,
		religionOfRealm: () => -1,
		time: () => 100,
		ranks: () => [0, 0, 2, 3, 1, 1],
		realmOf: (province) => province,
	}
	people.persons.sex[1] = 1
	HOUSEHOLD.relocate({ people, person: 0, province: 2, time: 100 })
	HOUSEHOLD.relocate({ people, person: 1, province: 3, time: 100 })
	HOUSEHOLD.weddingResidence({ people, a: 0, b: 1, time: 100 })
	expect(people.persons.residence[1]).toBe(2)
	PEOPLE.setRuler({ people, person: 1, seat: 3, rank: 3, reason: "unknown" })
	PEOPLE.setRuler({ people, person: 0, seat: 2, rank: 2, reason: "unknown" })
	HOUSEHOLD.weddingResidence({ people, a: 0, b: 1, time: 100 })
	expect(people.persons.residence[0]).toBe(2)
	expect(people.persons.residence[1]).toBe(3)
	PEOPLE.vacate({ people, seat: 3, reason: "unknown" })
	expect(people.persons.residence[1]).toBe(3)
	expect(HOUSEHOLD.realmOf({ people, person: 1 })).toBe(3)
})

it("freezes a mixed crown/district walk and dispatches each crown with its own law", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const crowns = Array.from(state.people.rulerOf.keys())
		.filter(
			(p) =>
				!state.desolate[p] &&
				STATE.isSovereign({ state, p }) &&
				state.provinceWars[p].length === 0,
		)
		.slice(0, 2)
	const district = Array.from(state.people.rulerOf.keys()).find((seat) =>
		STATE_TITLES.isDistrictSeat({ state, seat }),
	)
	if (district === undefined) throw new Error("Missing district")
	const time = state.time / STATE.yearMs
	const rng = RNG.createRng({ seed: 81 })
	const dying = PEOPLE.spawn({
		recordHealth: true,
		death: null,
		nameSeed: null,
		people: state.people,
		sex: 0,
		birth: time - 50,
		survives: time - 50,
		father: -1,
		mother: -1,
		dynasty: -1,
		origin: STATE.originOf({ state, realm: crowns[0] }),
		rng,
	})
	state.people.persons.death[dying] = time + 0.25
	const heirs = [0, 1, 2].map((index) =>
		PEOPLE.spawn({
			recordHealth: true,
			death: null,
			nameSeed: null,
			people: state.people,
			sex: 0,
			birth: time - 30 + index,
			survives: time - 30 + index,
			father: dying,
			mother: -1,
			dynasty: -1,
			origin: STATE.originOf({ state, realm: crowns[0] }),
			rng,
		}),
	)
	for (const heir of heirs) state.people.persons.death[heir] = time + 50
	for (const crown of crowns) {
		for (const other of [...state.relationColumns[crown]])
			STATE.setRelation({ state, a: crown, b: other, rel: STATE.rel.NONE })
		state.governmentType[crown] = GOVERNMENT.getGovIdx().feudal_monarchy
	}
	for (const [seat, rank] of [
		[crowns[0], 4],
		[crowns[1], 3],
		[district, 1],
	]) {
		state.seatRank[seat] = rank
		PEOPLE.setRuler({
			people: state.people,
			person: dying,
			seat,
			rank,
			reason: "unknown",
		})
	}
	const revision = state.deathSchedule.pending.get(dying)?.revision ?? -1
	const choose = vi
		.spyOn(SUCCESSION_SYSTEMS, "choose")
		.mockImplementation(({ realm }) => ({
			heir: realm === crowns[0] ? heirs[0] : heirs[1],
			claim: 3,
			pretender: -1,
			pretenderSeat: -1,
			supportingSeats: [],
		}))
	state.time += STATE.yearMs / 4
	try {
		PERSON_DEATH.run({ state, person: dying, revision, rng })
		expect(choose.mock.calls.map(([params]) => params.realm)).toEqual(crowns)
		expect(state.people.rulerOf[crowns[0]]).toBe(heirs[0])
		expect(state.people.rulerOf[crowns[1]]).toBe(heirs[1])
		expect(state.people.rulerOf[district]).toBe(heirs[2])
		expect(state.people.persons.heldSeats[dying]).toEqual([])
		PERSON_DEATH.run({ state, person: dying, revision, rng })
		expect(choose).toHaveBeenCalledTimes(2)
	} finally {
		choose.mockRestore()
	}
}, 60000)

it("installs each initial relative grant before selecting the next without expanding terminal kin", () => {
	const people = PEOPLE.create(25)
	people.household.time = () => 100
	const rng = RNG.createRng({ seed: 1 })
	const peopleIds = Array.from({ length: 5 }, (...entry) => {
		const id = entry[1]
		return PEOPLE.spawn({
			people,
			sex: 0,
			birth: 40 + id * 5,
			survives: 100,
			father: id === 0 ? -1 : id === 4 ? 2 : 0,
			mother: -1,
			dynasty: 0,
			origin: { realm: 0, culture: 0, genderSystem: 0 },
			nameSeed: null,
			death: null,
			recordHealth: false,
			rng,
		})
	})
	people.persons.death[peopleIds[2]] = 99
	const state = {
		people,
		time: 100 * STATE.yearMs,
		P: 25,
		parentCurrent: new Int32Array(25).fill(0),
		sovereignCurrent: new Int32Array(25),
		seatRank: new Uint8Array(25),
		desolate: new Uint8Array(25),
		stateless: new Uint8Array(25),
		culture: new Int32Array(25),
		cultureGenderSystems: new Uint8Array([0]),
		habitability: new Float32Array(25).fill(1),
		popUrbanCurrent: new Float64Array(25),
		waterAccess: new Uint8Array(25),
		province_xyz: new Float32Array(75),
	} as unknown as HistoryState
	state.parentCurrent[0] = -1
	state.seatRank.set([3, 1, 1])
	PEOPLE.setRuler({
		people,
		person: peopleIds[0],
		seat: 0,
		rank: 3,
		reason: "unknown",
	})
	const found = vi.fn(() => {
		throw new Error("Unexpected fresh family")
	})
	const source = { ...rng, random: () => 0 }
	const count = people.persons.sex.length
	DISTRICTS.grant({
		state,
		rng: source,
		found,
		randomOf: () => source,
		recordOpinionMemory: false,
	})
	expect(found).not.toHaveBeenCalled()
	expect(new Set([people.rulerOf[1], people.rulerOf[2]])).toEqual(
		new Set([peopleIds[3], peopleIds[4]]),
	)
	for (const person of [peopleIds[3], peopleIds[4]])
		expect(people.persons.heldSeats[person]).toHaveLength(1)
	expect(people.persons.sex.length).toBe(count)
	expect(people.persons.children[peopleIds[4]]).toEqual([])
	expect(people.persons.spouse[peopleIds[4]]).toBe(-1)
	expect(people.startingFamilies.relativeGrants).toBe(2)
})
