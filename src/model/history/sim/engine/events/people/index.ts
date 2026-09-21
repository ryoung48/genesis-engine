import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	DeathEventParams,
	InitPeopleParams,
	PeopleEventParams,
	WeddingEventParams,
} from "@/model/history/sim/engine/events/people/types"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { BACKFILL } from "@/model/history/sim/people/backfill"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { MARRIAGE } from "@/model/history/sim/people/marriage"
import { RULER } from "@/model/history/sim/ruler"

function init({ state, seed, years }: InitPeopleParams): void {
	const seats = [] as {
		seat: number
		culture: number
		dynasty: number
		standing: number
	}[]
	for (let seat = 0; seat < state.P; seat++) {
		if (state.leaderNameSeedCurrent[seat] < 0) continue
		seats.push({
			seat,
			culture: state.culture[seat],
			dynasty: state.leaderDynCurrent[seat],
			standing: state.seatRank[seat] + 1,
		})
	}
	const result = BACKFILL.create({
		seats,
		seatRank: state.seatRank,
		seatCount: state.P,
		start: state.time / STATE.yearMs,
		years,
		seed,
	})
	state.people = result.people
	state.peopleRng = HISTORY_RNG.createHistoryRng(seed + 172917)
	state.nextDynasty = Math.max(state.nextDynasty, result.people.nextDynasty)
	for (const seat of seats)
		RULER.install({
			state,
			seat: seat.seat,
			heir: result.people.holderOfSeat[seat.seat],
			dynasty: seat.dynasty,
			rng: state.peopleRng,
			initial: true,
		})
	for (const pregnancy of result.pending) {
		const id = state.peoplePregnancies.push(pregnancy) - 1
		state.heap.enqueue(pregnancy.due * STATE.yearMs, EVENT_HEAP.evt.BIRTH, id)
	}
	state.heap.enqueue(state.time, EVENT_HEAP.evt.PEOPLE_YEAR, 0)
}

function runYear({ state }: PeopleEventParams): void {
	const people = state.people
	const rng = state.peopleRng
	if (!people || !rng) return
	const neighbors = new Map<number, readonly number[]>()
	for (let seat = 0; seat < state.P; seat++) {
		if (!STATE.isSovereign({ state, p: seat })) continue
		neighbors.set(seat, STATE.getNationNeighbors({ state, nation: seat }))
	}
	const result = PEOPLE.runYear({
		people,
		from: state.time / STATE.yearMs,
		sovereignOfResidence: state.sovereignCurrent,
		cultureOfResidence: state.culture,
		neighbors,
		rng,
	})
	for (const death of result.deaths)
		state.heap.enqueue(
			death.time * STATE.yearMs,
			EVENT_HEAP.evt.DEATH,
			death.person,
			death.serial,
		)
	for (const wedding of result.weddings)
		state.heap.enqueue(
			wedding.time * STATE.yearMs,
			EVENT_HEAP.evt.WEDDING,
			wedding.husband,
			wedding.wife,
		)
	for (const pregnancy of result.pregnancies) {
		const id = state.peoplePregnancies.push(pregnancy) - 1
		state.heap.enqueue(pregnancy.due * STATE.yearMs, EVENT_HEAP.evt.BIRTH, id)
	}
	state.heap.enqueue(state.time + STATE.yearMs, EVENT_HEAP.evt.PEOPLE_YEAR, 0)
}

function birth({ state, id }: PeopleEventParams): void {
	const people = state.people
	const rng = state.peopleRng
	if (!people || !rng) return
	const pregnancy = state.peoplePregnancies[id]
	if (!pregnancy) return
	const result = FERTILITY.birth({ people, pregnancy, rng })
	const time = state.time / STATE.yearMs
	for (const child of result.children) {
		const persons = people.persons
		PEOPLE_LOG.append({
			log: people.log,
			...PEOPLE_LOG.birthRow({ persons, person: child, time }),
		})
		PEOPLE_LOG.append({
			log: people.log,
			...PEOPLE_LOG.healthRow({ persons, person: child, time }),
		})
	}
	if (result.motherDied)
		state.heap.enqueue(
			pregnancy.due * STATE.yearMs,
			EVENT_HEAP.evt.DEATH,
			pregnancy.mother,
			people.persons.deathSerial[pregnancy.mother],
		)
}

function wedding({ state, id: husband, wife }: WeddingEventParams): void {
	const people = state.people
	if (!people) return
	const time = state.time / STATE.yearMs
	const marriage = MARRIAGE.marry({ people, husband, wife, time })
	if (marriage < 0) return
	PEOPLE_LOG.append({
		log: people.log,
		...PEOPLE_LOG.weddingRow({ time, husband, wife }),
	})
}

function death({ state, id: person, serial }: DeathEventParams): void {
	const people = state.people
	const rng = state.peopleRng
	if (!people || !rng) return
	const time = state.time / STATE.yearMs
	if (!PEOPLE.applyDeath({ people, person, time, serial })) return
	const seats: number[] = []
	let seat = people.persons.seat[person]
	while (seat >= 0) {
		seats.push(seat)
		seat = people.nextSeatOfHolder[seat]
	}
	for (const held of seats)
		SUCCESSION.runSuccession({
			state,
			province: held,
			leaderIdx: state.leaderRuntime.idx[held],
			rng,
		})
	PEOPLE_LOG.append({
		log: people.log,
		...PEOPLE_LOG.deathRow({ persons: people.persons, person, time }),
	})
}

export const PEOPLE_EVENTS = { init, runYear, birth, wedding, death }
