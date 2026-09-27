import type {
	DistrictParams,
	GrantCandidate,
	HolderParams,
	InstallDistrictParams,
	SeatParams,
} from "@/model/history/sim/engine/events/people/districts/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { PEOPLE } from "@/model/history/sim/people"
import { FAMILY } from "@/model/history/sim/people/family"
import { HEIRS } from "@/model/history/sim/people/heirs"
import { DEJURE } from "@/model/society/dejure"

const NEW_GRANT_RELATIVE_CHANCE = 0.3
const ADULT_AGE = 16

// Share of a realm's titled seats held as districts rather than crown demesne.
function grantShare(size: number): number {
	if (size <= 4) return 0
	if (size >= 25) return 0.92
	if (size <= 7) return ((size - 4) / 3) * 0.13
	if (size <= 10) return 0.13 + ((size - 7) / 3) * 0.57
	return 0.7 + ((size - 10) / 14) * 0.2
}

function isDistrictSeat({ state, seat }: SeatParams): boolean {
	const parent = state.parentCurrent[seat]
	return (
		parent >= 0 &&
		parent === state.sovereignCurrent[seat] &&
		state.seatRank[seat] > 0 &&
		!state.desolate[seat]
	)
}

function now(state: HistoryState): number {
	return state.time / STATE.yearMs
}

// The sovereign's closest adult relative who holds nothing, passing over the
// heir apparent so the crown is not split from its heir; with no adult
// children this is usually a sibling.
function landlessRelative({ state, seat }: SeatParams): number {
	const people = state.people
	const sovereign = state.sovereignCurrent[seat]
	const ruler = people.rulerOf[sovereign]
	if (ruler < 0) return -1
	const time = now(state)
	const preference = PEOPLE.preference(
		STATE.originOf({ state, realm: sovereign }),
	)
	const apparent = HEIRS.of({
		people,
		dying: ruler,
		time,
		preference,
		eligible: () => true,
	}).heir
	return HEIRS.of({
		people,
		dying: ruler,
		time,
		preference,
		eligible: (person) =>
			person !== apparent &&
			people.persons.throne[person] < 0 &&
			time - people.persons.birth[person] >= ADULT_AGE,
	}).heir
}

function newHolder({ state, seat, relativeFirst, rng }: HolderParams): number {
	const relative = relativeFirst ? landlessRelative({ state, seat }) : -1
	if (relative >= 0) return relative
	const sovereign = state.sovereignCurrent[seat]
	const origin = STATE.originOf({ state, realm: seat })
	return FAMILY.found({
		people: state.people,
		origin: { ...origin, realm: sovereign },
		time: now(state),
		age: rng.uniform(18, 55),
		rank: state.seatRank[seat],
		rng,
	})
}

function install({ state, seat, person }: InstallDistrictParams): void {
	PEOPLE.vacate({ people: state.people, seat })
	PEOPLE.enthrone({
		people: state.people,
		person,
		seat,
		realm: state.sovereignCurrent[seat],
		rank: state.seatRank[seat],
	})
}

function settle({ state, rng }: DistrictParams): void {
	const people = state.people
	const table = people.persons
	const time = now(state)
	for (let seat = 0; seat < state.P; seat++) {
		const holder = people.rulerOf[seat]
		if (holder < 0 || STATE.isSovereign({ state, p: seat })) continue
		if (!isDistrictSeat({ state, seat })) {
			PEOPLE.vacate({ people, seat })
			continue
		}
		if (
			table.throne[holder] === seat &&
			PEOPLE.aliveAt({ people, person: holder, time })
		) {
			table.realm[holder] = state.sovereignCurrent[seat]
			continue
		}
		const heir = HEIRS.of({
			people,
			dying: holder,
			time,
			preference: PEOPLE.preference(STATE.originOf({ state, realm: seat })),
			eligible: (person) =>
				table.throne[person] < 0 && time - table.birth[person] >= ADULT_AGE,
		}).heir
		install({
			state,
			seat,
			person:
				heir >= 0 ? heir : newHolder({ state, seat, relativeFirst: true, rng }),
		})
	}
}

function grant({ state, rng }: DistrictParams): void {
	const people = state.people
	const size = new Map<number, number>()
	const seats = new Map<number, number[]>()
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || state.stateless[p]) continue
		const sovereign = state.sovereignCurrent[p]
		if (sovereign < 0) continue
		size.set(sovereign, (size.get(sovereign) ?? 0) + 1)
		if (!isDistrictSeat({ state, seat: p })) continue
		const list = seats.get(sovereign)
		if (list) list.push(p)
		else seats.set(sovereign, [p])
	}
	for (const [sovereign, list] of seats) {
		const roll = (Math.imul(sovereign + 1, 2246822519) >>> 0) / 2 ** 32
		const wanted = Math.floor(
			grantShare(size.get(sovereign) ?? 0) * list.length + roll,
		)
		const open = list.filter((seat) => people.rulerOf[seat] < 0)
		const missing = wanted - (list.length - open.length)
		if (missing <= 0) continue
		const score = (seat: number) =>
			DEJURE.seatScore({
				province: seat,
				habitability: state.habitability,
				urbanPop: state.popUrbanCurrent,
				waterAccess: state.waterAccess,
			})
		let maxScore = 0
		let maxDistance = 0
		for (const seat of open) {
			maxScore = Math.max(maxScore, score(seat))
			maxDistance = Math.max(
				maxDistance,
				STATE.provinceDistanceSq({ state, a: sovereign, b: seat }),
			)
		}
		// The crown keeps its best and nearest seats; poor, distant ones are
		// granted first.
		const candidates: GrantCandidate[] = open.map((seat) => ({
			seat,
			key:
				score(seat) / (maxScore || 1) -
				STATE.provinceDistanceSq({ state, a: sovereign, b: seat }) /
					(maxDistance || 1),
		}))
		candidates.sort((a, b) => a.key - b.key || a.seat - b.seat)
		for (const { seat } of candidates.slice(0, missing))
			install({
				state,
				seat,
				person: newHolder({
					state,
					seat,
					relativeFirst: rng.random() < NEW_GRANT_RELATIVE_CHANCE,
					rng,
				}),
			})
	}
}

export const DISTRICTS = { settle, grant }
