import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { PARTITION_SHARES } from "@/model/history/sim/engine/events/succession/partition/shares"
import { PARTITION_TITLES } from "@/model/history/sim/engine/events/succession/partition/titles"
import type {
	AllocateParams,
	BranchParams,
	DivideParams,
	JuniorHeirsParams,
	NoteParams,
	PartitionNoteData,
	PartitionRealmKind,
	PartitionRun,
	PartitionShare,
	PartitionSkippedNoteData,
	PartitionSnapshot,
	PieceParams,
	PrimarySeatParams,
	ProjectPartitionParams,
	RealmParams,
	ReleaseParams,
	SkipParams,
} from "@/model/history/sim/engine/events/succession/partition/types"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { HEIRS } from "@/model/history/sim/people/heirs"
import { HOLDINGS } from "@/model/history/sim/people/holdings"
import { ERAS } from "@/model/society/eras"

function now(state: HistoryState): number {
	return state.time / STATE.yearMs
}

function branchOf({ people, dying, person }: BranchParams): number {
	if (dying < 0) return -1
	const table = people.persons
	const seen = new Set<number>()
	const stack = [person]
	while (stack.length > 0) {
		const current = stack.pop() as number
		if (current < 0 || seen.has(current)) continue
		if (table.birth[current] <= table.birth[dying]) continue
		seen.add(current)
		if (table.father[current] === dying || table.mother[current] === dying)
			return current
		stack.push(table.father[current], table.mother[current])
	}
	return -1
}

function juniorHeirs({
	state,
	realm,
	dying,
	branch,
}: JuniorHeirsParams): number[] {
	const people = state.people
	const preference = SUCCESSION_SYSTEMS.preferenceOf({ state, realm })
	const heirs = HEIRS.line({
		people,
		dying,
		time: now(state),
		preference,
		eligible: (person) => SUCCESSION_SYSTEMS.available({ state, person }),
	})
		.filter((entry) => entry.branch !== branch && entry.heir >= 0)
		.map((entry) => entry.heir)
	if (preference === "none") return heirs
	const wanted = preference === "male" ? 0 : 1
	const preferred = heirs.filter((heir) => people.persons.sex[heir] === wanted)
	return preferred.length > 0 ? preferred : heirs
}

function vacatePrimarySeat({
	state,
	realm,
	primary,
	primarySeat,
}: PrimarySeatParams): void {
	if (
		primarySeat < 0 ||
		primarySeat === realm ||
		STATE.isSovereign({ state, p: primarySeat }) ||
		state.people.rulerOf[primarySeat] !== primary
	)
		return
	PEOPLE.vacate({
		people: state.people,
		seat: primarySeat,
		reason: "partition",
	})
}

function snapshot({ state, realm }: RealmParams): PartitionSnapshot {
	const provinces = STATE.getNationProvinces({ state, root: realm }).filter(
		(p) => !state.desolate[p],
	)
	let population = 0
	for (const p of provinces)
		population += state.popRuralCurrent[p] + state.popUrbanCurrent[p]
	return {
		provinces,
		population,
		topTier: STATE_TITLES.topTier({ state, realm }),
		seats: provinces.filter((p) => p !== realm && state.people.rulerOf[p] >= 0),
		titleHolder: state.titles.holder.slice(0, state.titles.count),
	}
}

function districtSeats({ state, realm }: RealmParams): number[] {
	const population = new Map<number, number>()
	const seats = STATE.getChildren({ state, p: realm }).filter(
		(seat) =>
			STATE_TITLES.isDistrictSeat({ state, seat }) && state.seatRank[seat] > 0,
	)
	for (const seat of seats)
		population.set(seat, STATE.getNationPopulation({ state, root: seat }))
	return seats.sort(
		(a, b) =>
			state.seatRank[b] - state.seatRank[a] ||
			(population.get(b) as number) - (population.get(a) as number) ||
			a - b,
	)
}

function allocate({
	state,
	realm,
	unseated,
	heirs,
	excludedSeat,
}: AllocateParams): PartitionShare[] {
	const people = state.people
	const { shares, allocated, remaining } = PARTITION_TITLES.allocate({
		state,
		realm,
		heirs,
	})
	const seats = districtSeats({ state, realm }).filter(
		(seat) => seat !== excludedSeat && !allocated.has(seat),
	)
	const held = new Map<number, number>()
	for (const heir of remaining) {
		const seat =
			seats.find((seat) => people.persons.heldSeats[heir].includes(seat)) ?? -1
		if (seats.includes(seat) && people.rulerOf[seat] === heir)
			held.set(heir, seat)
	}
	const reserved = new Set(held.values())
	const free = seats.filter(
		(seat) =>
			!reserved.has(seat) && !PARTITION_SHARES.occupied({ state, seat }),
	)
	for (const heir of remaining) {
		const own = held.get(heir)
		if (own !== undefined) {
			if (PARTITION_SHARES.occupied({ state, seat: own }))
				unseated.push({ heir, reason: "reserved seat unavailable" })
			else shares.push({ heir, seat: own, kind: "district", supporters: [] })
			continue
		}
		const seat = free.shift()
		if (seat === undefined) unseated.push({ heir, reason: "no seat" })
		else shares.push({ heir, seat, kind: "district", supporters: [] })
	}
	return shares
}

function release({ run, share }: ReleaseParams): void {
	const { state, realm, rng } = run
	const { heir, seat } = share
	const people = state.people
	if (
		(share.kind === "district"
			? !STATE_TITLES.isDistrictSeat({ state, seat }) ||
				state.seatRank[seat] === 0
			: state.seatRank[seat] !== run.snapshot.topTier) ||
		state.sovereignCurrent[seat] !== realm ||
		[seat, ...share.supporters].some(
			(p) =>
				state.sovereignCurrent[p] !== realm ||
				PARTITION_SHARES.occupied({ state, seat: p }),
		) ||
		!SUCCESSION_SYSTEMS.available({ state, person: heir })
	) {
		run.unseated.push({ heir, reason: "share dropped" })
		return
	}
	const other = HOLDINGS.primary({
		people,
		person: heir,
		ranks: state.seatRank,
	})
	if (other >= 0 && other !== seat)
		PEOPLE.vacate({ people, seat: other, reason: "partition" })
	const holder = people.rulerOf[seat]
	if (holder !== heir) {
		if (
			holder >= 0 &&
			people.persons.heldSeats[holder].includes(seat) &&
			PEOPLE.aliveAt({ people, person: holder, time: now(state) })
		)
			run.displaced.push({
				person: holder,
				seat,
				rank: state.districtRank[seat],
			})
		DISTRICTS.install({ state, seat, person: heir, reason: "partition" })
	}
	FIELDS.prov.government.set({
		state,
		p: seat,
		value: state.governmentType[realm],
	})
	STATE.releaseFaction({
		state,
		p: seat,
		supporters: share.supporters,
		rng,
		reason: "partition",
	})
	run.released.push(share)
}

function cutOffPieces({ state, realm }: RealmParams): number[] {
	return STATE.getChildren({ state, p: realm })
		.filter((child) => !STATE.isConnectedToParent({ state, province: child }))
		.sort((a, b) => state.seatRank[b] - state.seatRank[a] || a - b)
}

function joinTarget({ run, piece }: PieceParams): number {
	const { state } = run
	const provinces = STATE.getNationProvinces({ state, root: piece })
	if (provinces.some((p) => state.occupationCurrent[p] >= 0)) return -1
	const bordering = new Set<number>()
	for (const p of provinces)
		for (const neighbor of STATE.getProvinceNeighbors({ state, p }))
			bordering.add(state.sovereignCurrent[neighbor])
	let best = -1
	let bestPopulation = 0
	for (const { seat } of run.released) {
		if (
			!STATE.isSovereign({ state, p: seat }) ||
			!bordering.has(seat) ||
			STATE_TITLES.topTier({ state, realm: seat }) < state.seatRank[piece]
		)
			continue
		const population = STATE.getNationPopulation({ state, root: seat })
		if (
			best < 0 ||
			STATE_TITLES.topTier({ state, realm: seat }) >
				STATE_TITLES.topTier({ state, realm: best }) ||
			(STATE_TITLES.topTier({ state, realm: seat }) ===
				STATE_TITLES.topTier({ state, realm: best }) &&
				(population > bestPopulation ||
					(population === bestPopulation && seat < best)))
		) {
			best = seat
			bestPopulation = population
		}
	}
	return best
}

function resolveCutOff(run: PartitionRun): void {
	const { state, realm, rng } = run
	for (;;) {
		let joined = false
		for (const piece of cutOffPieces({ state, realm })) {
			const target = joinTarget({ run, piece })
			if (target < 0) continue
			STATE.repartitionNation({
				state,
				nation: target,
				subjects: STATE.getNationProvinces({ state, root: piece }),
			})
			STATE.repartitionNation({ state, nation: realm, subjects: [] })
			run.joined.push({ district: piece, realm: target })
			joined = true
			break
		}
		if (!joined) break
	}
	STATE.fixConnections({ state, nation: realm, rng })
}

function reseat(run: PartitionRun): void {
	const { state, snapshot: before } = run
	const people = state.people
	for (const check of DISTRICTS.revalidate({ state, seats: before.seats }))
		if (
			check.standing === "vacated" &&
			people.persons.heldSeats[check.holder].length === 0 &&
			PEOPLE.aliveAt({ people, person: check.holder, time: now(state) })
		)
			run.displaced.push({
				person: check.holder,
				seat: check.seat,
				rank: check.rank,
			})
	run.moves.push(
		...DISTRICTS.reseat({
			state,
			displaced: run.displaced,
			reason: "partition",
		}),
	)
}

function skip({ state, realm, dying, primary, reason }: SkipParams): number {
	const data: PartitionSkippedNoteData = {
		nation: realm,
		dying,
		primary,
		government: ERAS.governmentTypes[state.governmentType[realm]],
		reason,
	}
	state.events.push({ tag: "partition skipped", time: state.time, data })
	return 0
}

function note({ run, dying, primary }: NoteParams): void {
	const { state, realm, snapshot: before } = run
	const population = new Map<number, number>()
	const provinces = new Map<number, number>()
	for (const p of before.provinces) {
		const root = state.sovereignCurrent[p]
		population.set(
			root,
			(population.get(root) ?? 0) +
				state.popRuralCurrent[p] +
				state.popUrbanCurrent[p],
		)
		provinces.set(root, (provinces.get(root) ?? 0) + 1)
	}
	const heirSeats = run.released.map((share) => share.seat)
	const realms = [
		realm,
		...heirSeats,
		...[...population.keys()].sort((a, b) => a - b),
	].filter((root, index, all) => all.indexOf(root) === index)
	const kind = (root: number): PartitionRealmKind =>
		root === realm ? "primary" : heirSeats.includes(root) ? "heir" : "released"
	const titlesLost: number[] = []
	for (let title = 0; title < before.titleHolder.length; title++)
		if (before.titleHolder[title] >= 0 && state.titles.holder[title] < 0)
			titlesLost.push(title)
	const data: PartitionNoteData = {
		nation: realm,
		dying,
		primary,
		government: ERAS.governmentTypes[state.governmentType[realm]],
		primaryRankBefore: before.topTier,
		populationBefore: before.population,
		provincesBefore: before.provinces.length,
		heirs: run.released.map((share) => share.heir),
		seats: heirSeats,
		shareKind: run.released.map((share) => share.kind),
		realms,
		realmKind: realms.map(kind),
		realmPopulation: realms.map((root) => population.get(root) ?? 0),
		realmProvinces: realms.map((root) => provinces.get(root) ?? 0),
		realmRank: realms.map((root) =>
			STATE_TITLES.topTier({ state, realm: root }),
		),
		adminPersons: run.moves.map((move) => move.person),
		adminFrom: run.moves.map((move) => move.from),
		adminTo: run.moves.map((move) => move.to),
		adminBumped: run.moves.map((move) => Number(move.bumped)),
		joinedDistricts: run.joined.map((join) => join.district),
		joinedRealms: run.joined.map((join) => join.realm),
		unseatedHeirs: run.unseated.map((entry) => entry.heir),
		unseatedReasons: run.unseated.map((entry) => entry.reason),
		titlesLost,
		titlesLostTier: titlesLost.map((title) => state.titles.tier[title]),
	}
	state.events.push({ tag: "partition", time: state.time, data })
}

function divide({
	state,
	realm,
	dying,
	primary,
	primarySeat,
	rng,
}: DivideParams): number {
	if (
		!GOVERNMENT.partitionsOfIndex(state.governmentType[realm]) ||
		!STATE.isSovereign({ state, p: realm })
	)
		return 0
	const branch = branchOf({ people: state.people, dying, person: primary })
	if (branch < 0)
		return skip({ state, realm, dying, primary, reason: "not child line" })
	const heirs = juniorHeirs({ state, realm, dying, branch })
	if (heirs.length === 0)
		return skip({ state, realm, dying, primary, reason: "no junior heir" })
	vacatePrimarySeat({ state, realm, primary, primarySeat })
	const run: PartitionRun = {
		state,
		realm,
		rng,
		snapshot: snapshot({ state, realm }),
		released: [],
		displaced: [],
		unseated: [],
		joined: [],
		moves: [],
	}
	for (const share of allocate({
		state,
		realm,
		unseated: run.unseated,
		heirs,
		excludedSeat: -1,
	}))
		release({ run, share })
	if (run.released.length === 0)
		return skip({ state, realm, dying, primary, reason: "no free seat" })
	resolveCutOff(run)
	reseat(run)
	for (const { seat } of run.released) REGENCY.start({ state, realm: seat })
	note({ run, dying, primary })
	return run.released.length
}

function project({
	state,
	realm,
	dying,
	primary,
}: ProjectPartitionParams): PartitionShare[] {
	if (!GOVERNMENT.partitionsOfIndex(state.governmentType[realm])) return []
	const branch = branchOf({ people: state.people, dying, person: primary })
	if (branch < 0) return []
	const held = HOLDINGS.primary({
		people: state.people,
		person: primary,
		ranks: state.seatRank,
	})
	const excludedSeat =
		held >= 0 &&
		held !== realm &&
		!STATE.isSovereign({ state, p: held }) &&
		state.people.rulerOf[held] === primary
			? held
			: -1
	return allocate({
		state,
		realm,
		unseated: [],
		excludedSeat,
		heirs: juniorHeirs({ state, realm, dying, branch }),
	})
}

export const PARTITION = { divide, project }
