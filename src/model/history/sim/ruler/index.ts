import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { STATE } from "@/model/history/sim/engine/state"
import { UNNAMED } from "@/model/history/sim/heirs/types"
import { PEOPLE } from "@/model/history/sim/people"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type {
	InstallRulerParams,
	LogSeatParams,
	ReleaseModeParams,
	ReseatRulersParams,
	RulerMove,
	VacateRulerParams,
} from "@/model/history/sim/ruler/types"

const FOUNDER_AGE_YEARS = 30
const DAYS_PER_YEAR = 365

function logSeat({ state, person, seat, gained }: LogSeatParams): void {
	if (!state.people) return
	PEOPLE_LOG.append({
		log: state.people.log,
		...PEOPLE_LOG.seatRow({
			time: state.time / STATE.yearMs,
			person,
			seat,
			gained,
		}),
	})
}

function install({
	state,
	seat,
	heir,
	dynasty,
	rng,
	initial,
}: InstallRulerParams): void {
	if (state.people) {
		const people = state.people
		const now = state.time / STATE.yearMs
		const person =
			heir === UNNAMED
				? PEOPLE.addPerson({
						people,
						sex: 0,
						birth: now - FOUNDER_AGE_YEARS,
						dynasty,
						culture: state.culture[seat],
						residence: seat,
						rng,
					})
				: heir
		if (heir === UNNAMED) {
			PEOPLE_LOG.append({
				log: people.log,
				...PEOPLE_LOG.arrivalRow({
					persons: people.persons,
					person,
					time: now,
					ageDays: FOUNDER_AGE_YEARS * DAYS_PER_YEAR,
				}),
			})
			PEOPLE_LOG.append({
				log: people.log,
				...PEOPLE_LOG.healthRow({ persons: people.persons, person, time: now }),
			})
		}
		const holder = people.holderOfSeat[seat]
		if (holder >= 0 && holder !== person) {
			PEOPLE.removeSeat({ people, seat })
			logSeat({ state, person: holder, seat, gained: false })
		}
		if (people.holderOfSeat[seat] < 0) {
			PEOPLE.assignSeat({ people, person, seat, seatRank: state.seatRank })
			logSeat({ state, person, seat, gained: true })
		}
		state.leaderRuntime.idx[seat]++
		state.leaderRuntime.birth[seat] =
			people.persons.birth[person] * STATE.yearMs
		state.leaderRuntime.end[seat] = Number.POSITIVE_INFINITY
		FIELDS.prov.leader.nameSeed.set({ state, p: seat, value: person })
		FIELDS.prov.leader.dynasty.set({
			state,
			p: seat,
			value: people.persons.dynasty[person],
		})
		FIELDS.prov.leader.birthYear.set({
			state,
			p: seat,
			value: people.persons.birth[person],
		})
		return
	}
	if (heir !== UNNAMED) throw new Error("Person ruler before backfill")
	STATE.spawnLeader({ state, p: seat, rng })
	FIELDS.prov.leader.dynasty.set({ state, p: seat, value: dynasty })
	if (!initial)
		state.heap.enqueue(
			state.leaderRuntime.end[seat],
			EVENT_HEAP.evt.SUCCESSION,
			seat,
			state.leaderRuntime.idx[seat],
		)
}

function vacate({ state, seat }: VacateRulerParams): void {
	if (state.people) {
		const holder = state.people.holderOfSeat[seat]
		PEOPLE.removeSeat({ people: state.people, seat })
		if (holder >= 0) logSeat({ state, person: holder, seat, gained: false })
	}
	state.leaderRuntime.idx[seat]++
	state.leaderRuntime.birth[seat] = 0
	state.leaderRuntime.end[seat] = 0
	FIELDS.prov.leader.dynasty.set({ state, p: seat, value: -1 })
	FIELDS.prov.leader.nameSeed.set({ state, p: seat, value: -1 })
	FIELDS.prov.leader.claim.set({ state, p: seat, value: 0 })
	FIELDS.prov.leader.birthYear.set({ state, p: seat, value: -1 })
}

function releaseMode({ state, seat }: ReleaseModeParams): "keep" | "spawn" {
	return state.leaderNameSeedCurrent[seat] >= 0 ? "keep" : "spawn"
}

function reseat({ state, rulers }: ReseatRulersParams): void {
	const moves: RulerMove[] = []
	for (const ruler of rulers) {
		if (
			ruler < 0 ||
			ruler >= state.P ||
			state.leaderNameSeedCurrent[ruler] < 0 ||
			(state.parentCurrent[ruler] < 0 && !state.stateless[ruler])
		)
			continue
		let best = -1
		let bestTier = -1
		let bestSize = -1
		for (let title = 0; title < state.titles.count; title++) {
			if (state.titles.holder[title] !== ruler) continue
			const tier = state.titles.tier[title]
			const size =
				state.titleMembers.offset[title + 1] - state.titleMembers.offset[title]
			if (
				tier > bestTier ||
				(tier === bestTier && size > bestSize) ||
				(tier === bestTier && size === bestSize && title < best)
			) {
				best = title
				bestTier = tier
				bestSize = size
			}
		}
		if (best < 0) {
			vacate({ state, seat: ruler })
			continue
		}
		const to = state.titles.seat[best]
		if (to === ruler) continue
		moves.push({
			from: ruler,
			to,
			person: state.people?.holderOfSeat[ruler] ?? -1,
			birth: state.leaderRuntime.birth[ruler],
			end: state.leaderRuntime.end[ruler],
			nameSeed: state.leaderNameSeedCurrent[ruler],
			dynasty: state.leaderDynCurrent[ruler],
			claim: state.leaderClaimCurrent[ruler],
			targetUrban: state.leaderRuntime.targetUrban[ruler],
		})
	}
	const targets = new Set<number>()
	for (const move of moves) {
		if (targets.has(move.to)) throw new Error("Two rulers share a new seat")
		targets.add(move.to)
	}
	for (const move of moves) vacate({ state, seat: move.from })
	for (const move of moves) {
		if (state.leaderNameSeedCurrent[move.to] >= 0)
			throw new Error("Ruler seat collision")
		state.leaderRuntime.idx[move.to]++
		if (state.people && move.person >= 0) {
			PEOPLE.assignSeat({
				people: state.people,
				person: move.person,
				seat: move.to,
				seatRank: state.seatRank,
			})
			logSeat({ state, person: move.person, seat: move.to, gained: true })
		}
		state.leaderRuntime.birth[move.to] = move.birth
		state.leaderRuntime.end[move.to] = move.end
		state.leaderRuntime.targetUrban[move.to] = move.targetUrban
		FIELDS.prov.leader.nameSeed.set({
			state,
			p: move.to,
			value: move.nameSeed,
		})
		FIELDS.prov.leader.dynasty.set({
			state,
			p: move.to,
			value: move.dynasty,
		})
		FIELDS.prov.leader.claim.set({ state, p: move.to, value: move.claim })
		FIELDS.prov.leader.birthYear.set({
			state,
			p: move.to,
			value: move.birth / STATE.yearMs,
		})
		if (!state.people)
			state.heap.enqueue(
				move.end,
				EVENT_HEAP.evt.SUCCESSION,
				move.to,
				state.leaderRuntime.idx[move.to],
			)
		for (let title = 0; title < state.titles.count; title++)
			if (state.titles.holder[title] === move.from) {
				state.titles.holder[title] = move.to
				state.events.push({
					tag: "title passed",
					time: state.time,
					data: {
						title,
						from: move.from,
						to: move.to,
						cause: "reseat",
					},
				})
			}
	}
}

export const RULER = { install, vacate, reseat, releaseMode }
