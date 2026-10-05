import { DEATH_SCHEDULE } from "@/model/history/sim/engine/events/people/death/schedule"
import type {
	AdminMove,
	DemoteParams,
	DistrictParams,
	GrantCandidate,
	GrantParams,
	HolderParams,
	HomeRegionParams,
	InstallDistrictParams,
	ReseatParams,
	RevalidateParams,
	SeatCheck,
	SucceedDistrictParams,
} from "@/model/history/sim/engine/events/people/districts/types"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { SeatParams } from "@/model/history/sim/engine/state/titles/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { PEOPLE } from "@/model/history/sim/people"
import { FAMILY } from "@/model/history/sim/people/family"
import { HEIRS } from "@/model/history/sim/people/heirs"
import { OPINION } from "@/model/history/sim/people/opinion"
import { DEJURE } from "@/model/society/dejure"

const NEW_GRANT_RELATIVE_CHANCE = 0.3
const ADULT_AGE = 16

function grantShare(size: number): number {
	if (size <= 4) return 0
	if (size >= 25) return 0.92
	if (size <= 7) return ((size - 4) / 3) * 0.13
	if (size <= 10) return 0.13 + ((size - 7) / 3) * 0.57
	return 0.7 + ((size - 10) / 14) * 0.2
}

function now(state: HistoryState): number {
	return state.time / STATE.yearMs
}

function landlessKin({ state, seat }: SeatParams): number {
	const people = state.people
	const holder = people.rulerOf[seat]
	if (holder < 0) return -1
	const time = now(state)
	const preference = PEOPLE.preference(STATE.originOf({ state, realm: seat }))
	const apparent = HEIRS.of({
		people,
		dying: holder,
		time,
		preference,
		eligible: () => true,
	}).heir
	return HEIRS.of({
		people,
		dying: holder,
		time,
		preference,
		eligible: (person) =>
			person !== apparent &&
			people.persons.heldSeats[person].length === 0 &&
			time - people.persons.birth[person] >= ADULT_AGE,
	}).heir
}

function cadet({ state, seat }: SeatParams): number {
	const people = state.people
	const time = now(state)
	const districts = STATE.getNationProvinces({
		state,
		root: state.sovereignCurrent[seat],
	}).filter(
		(other) =>
			other !== seat &&
			STATE_TITLES.isDistrictSeat({ state, seat: other }) &&
			people.rulerOf[other] >= 0 &&
			PEOPLE.aliveAt({ people, person: people.rulerOf[other], time }),
	)
	districts.sort(
		(a, b) =>
			STATE.provinceDistanceSq({ state, a: seat, b: a }) -
				STATE.provinceDistanceSq({ state, a: seat, b }) || a - b,
	)
	for (const other of districts) {
		const kin = landlessKin({ state, seat: other })
		if (kin >= 0) return kin
	}
	return -1
}

function newHolder({
	state,
	seat,
	relativeFirst,
	rng,
	found,
}: HolderParams): number {
	const relative = relativeFirst
		? landlessKin({ state, seat: state.sovereignCurrent[seat] })
		: -1
	if (relative >= 0) {
		if (found) state.people.startingFamilies.relativeGrants++
		return relative
	}
	const kin = cadet({ state, seat })
	if (kin >= 0) return kin
	if (found) return found(seat)
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

function install({
	state,
	seat,
	person,
	reason,
}: InstallDistrictParams): boolean {
	if (!PEOPLE.aliveAt({ people: state.people, person, time: now(state) }))
		return false
	PEOPLE.setRuler({
		people: state.people,
		person,
		seat,
		rank: state.seatRank[seat],
		reason,
	})
	return true
}

function revalidate({ state, seats }: RevalidateParams): SeatCheck[] {
	const people = state.people
	const table = people.persons
	const time = now(state)
	const checks: SeatCheck[] = []
	for (const seat of seats) {
		const holder = people.rulerOf[seat]
		if (holder < 0 || STATE.isSovereign({ state, p: seat })) continue
		if (!STATE_TITLES.isDistrictSeat({ state, seat })) {
			PEOPLE.vacate({ people, seat, reason: "territorial change" })
			checks.push({
				seat,
				holder,
				rank: state.districtRank[seat],
				standing: "vacated",
			})
			continue
		}
		if (
			table.heldSeats[holder].includes(seat) &&
			PEOPLE.aliveAt({ people, person: holder, time })
		) {
			checks.push({
				seat,
				holder,
				rank: state.districtRank[seat],
				standing: "kept",
			})
			continue
		}
		checks.push({
			seat,
			holder,
			rank: state.districtRank[seat],
			standing: "lapsed",
		})
	}
	return checks
}

function heirOf({ state, seat }: SeatParams): number {
	const people = state.people
	const table = people.persons
	const time = now(state)
	const holder = people.rulerOf[seat]
	if (holder < 0 || !STATE_TITLES.isDistrictSeat({ state, seat })) return -1
	return HEIRS.of({
		people,
		dying: holder,
		time,
		preference: PEOPLE.preference(STATE.originOf({ state, realm: seat })),
		eligible: (person) =>
			table.heldSeats[person].length === 0 &&
			time - table.birth[person] >= ADULT_AGE,
	}).heir
}

function succeed({ state, seat, rng }: SucceedDistrictParams): void {
	if (
		state.people.rulerOf[seat] < 0 ||
		!STATE_TITLES.isDistrictSeat({ state, seat })
	)
		return
	const heir = heirOf({ state, seat })
	install({
		state,
		seat,
		person:
			heir >= 0
				? heir
				: newHolder({ state, seat, relativeFirst: true, rng, found: null }),
		reason: "succession",
	})
}

function homeRegion({ state, displaced }: HomeRegionParams): Set<number> {
	const { seat, rank } = displaced
	const title =
		rank > 0
			? DEJURE.titleAt({
					titles: state.titles,
					provinceCount: state.P,
					tier: rank,
					province: seat,
				})
			: -1
	if (title < 0) return new Set([seat])
	return new Set(
		state.titleMembers.list.subarray(
			state.titleMembers.offset[title],
			state.titleMembers.offset[title + 1],
		),
	)
}

function demote({ state, displaced, reason, moves }: DemoteParams): void {
	const people = state.people
	let { person, seat, rank } = displaced
	for (;;) {
		const realm = state.sovereignCurrent[seat]
		const home = homeRegion({ state, displaced: { person, seat, rank } })
		const candidates =
			realm < 0
				? []
				: STATE.getChildren({ state, p: realm }).filter(
						(candidate) =>
							STATE_TITLES.isDistrictSeat({ state, seat: candidate }) &&
							state.seatRank[candidate] < rank,
					)
		const population = new Map(
			candidates.map((candidate) => [
				candidate,
				STATE.getNationPopulation({ state, root: candidate }),
			]),
		)
		const target = candidates.sort(
			(a, b) =>
				Number(home.has(b)) - Number(home.has(a)) ||
				Number(people.rulerOf[a] >= 0) - Number(people.rulerOf[b] >= 0) ||
				state.seatRank[b] - state.seatRank[a] ||
				(population.get(b) as number) - (population.get(a) as number) ||
				a - b,
		)[0]
		if (target === undefined) {
			moves.push({
				person,
				from: seat,
				to: -1,
				bumped: false,
				rank,
				reason: "landless",
			})
			return
		}
		const bumped = people.rulerOf[target]
		const targetRank = state.districtRank[target]
		install({
			state,
			seat: target,
			person,
			reason: reason === "partition" ? reason : "demotion",
		})
		moves.push({
			person,
			from: seat,
			to: target,
			bumped: bumped >= 0,
			rank,
			reason: "demotion",
		})
		if (
			bumped < 0 ||
			people.persons.heldSeats[bumped].length > 0 ||
			!PEOPLE.aliveAt({ people, person: bumped, time: now(state) })
		)
			return
		person = bumped
		seat = target
		rank = targetRank
	}
}

function reseat({ state, displaced, reason }: ReseatParams): AdminMove[] {
	const people = state.people
	const moves: AdminMove[] = []
	const population = new Map(
		displaced.map((holder) => {
			let total = 0
			const realm = state.sovereignCurrent[holder.seat]
			for (const p of homeRegion({ state, displaced: holder }))
				if (state.sovereignCurrent[p] === realm && !state.desolate[p])
					total += state.popRuralCurrent[p] + state.popUrbanCurrent[p]
			return [holder.seat, total]
		}),
	)
	for (const holder of displaced.toSorted(
		(a, b) =>
			b.rank - a.rank ||
			(population.get(b.seat) as number) - (population.get(a.seat) as number) ||
			a.seat - b.seat,
	)) {
		if (
			people.persons.heldSeats[holder.person].length > 0 ||
			!PEOPLE.aliveAt({ people, person: holder.person, time: now(state) })
		)
			continue
		const target = state.parentCurrent[holder.seat]
		if (
			target >= 0 &&
			STATE_TITLES.isDistrictSeat({ state, seat: target }) &&
			people.rulerOf[target] < 0 &&
			state.seatRank[target] > holder.rank
		) {
			install({
				state,
				seat: target,
				person: holder.person,
				reason: reason === "partition" ? reason : "promotion",
			})
			moves.push({
				person: holder.person,
				from: holder.seat,
				to: target,
				bumped: false,
				rank: holder.rank,
				reason: "promotion",
			})
		} else demote({ state, displaced: holder, reason, moves })
	}
	return moves
}

function settle({ state }: DistrictParams): void {
	const seats: number[] = []
	for (let seat = 0; seat < state.P; seat++)
		if (state.people.rulerOf[seat] >= 0) seats.push(seat)
	const displaced = []
	for (const check of revalidate({ state, seats })) {
		DEATH_SCHEDULE.ensure({ state, person: check.holder, cause: "natural" })
		if (check.standing === "vacated")
			displaced.push({
				person: check.holder,
				seat: check.seat,
				rank: check.rank,
			})
	}
	DISTRICTS.reseat({ state, displaced, reason: "territorial change" })
}

function grant({
	state,
	rng,
	found,
	randomOf,
	recordOpinionMemory,
}: GrantParams): void {
	const people = state.people
	const size = new Map<number, number>()
	const seats = new Map<number, number[]>()
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p] || state.stateless[p]) continue
		const sovereign = state.sovereignCurrent[p]
		if (sovereign < 0) continue
		size.set(sovereign, (size.get(sovereign) ?? 0) + 1)
		if (!STATE_TITLES.isDistrictSeat({ state, seat: p })) continue
		const list = seats.get(sovereign)
		if (list) list.push(p)
		else seats.set(sovereign, [p])
	}
	for (const [sovereign, list] of [...seats].sort((a, b) => a[0] - b[0])) {
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
		for (const { seat } of candidates.slice(0, missing)) {
			const source = randomOf?.(seat) ?? rng
			const grantor = GOVERNOR.of({ state, realm: sovereign })
			const person = newHolder({
				state,
				seat,
				relativeFirst: source.random() < NEW_GRANT_RELATIVE_CHANCE,
				rng: source,
				found,
			})
			if (
				install({ state, seat, person, reason: "district grant" }) &&
				recordOpinionMemory
			)
				OPINION.remember({
					people,
					observer: person,
					target: grantor,
					reason: "grant",
					time: now(state),
				})
		}
	}
}

export const DISTRICTS = {
	heirOf,
	succeed,
	settle,
	grant,
	install,
	revalidate,
	reseat,
}
