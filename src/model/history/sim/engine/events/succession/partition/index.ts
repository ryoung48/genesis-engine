import { PARTITION_SHARES } from "@/model/history/sim/engine/events/succession/partition/shares"
import { PARTITION_TITLES } from "@/model/history/sim/engine/events/succession/partition/titles"
import type {
	AllocateParams,
	DivideParams,
	NoteParams,
	PartitionNoteData,
	PartitionRealmKind,
	PartitionRun,
	PartitionShare,
	PieceParams,
	RealmParams,
	ReleaseParams,
	SkipParams,
} from "@/model/history/sim/engine/events/succession/partition/types"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { ERAS } from "@/model/society/eras"

const HEIR_CLAIM = 3

function snapshot({ state, realm }: RealmParams) {
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
		titleHolder: state.titles.holder.slice(0, state.titles.count),
	}
}

function districtSeats({ state, realm }: RealmParams): number[] {
	const population = new Map<number, number>()
	const seats = SUCCESSION_SYSTEMS.districts({ state, realm }).filter(
		(seat) => state.seatRank[seat] > 0,
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
	count,
}: AllocateParams): PartitionShare[] {
	if (count === 0) return []
	const { shares, allocated, remaining } = PARTITION_TITLES.allocate({
		state,
		realm,
		count,
	})
	if (remaining === 0) return shares
	const free = districtSeats({ state, realm }).filter(
		(seat) =>
			!allocated.has(seat) && !PARTITION_SHARES.occupied({ state, seat }),
	)
	for (let slot = 0; slot < remaining; slot++) {
		const seat = free.shift()
		if (seat === undefined) unseated.push({ reason: "no seat" })
		else shares.push({ seat, kind: "district", supporters: [] })
	}
	return shares
}

function release({ run, share }: ReleaseParams): void {
	const { state, realm, rng } = run
	const { seat } = share
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
		)
	) {
		run.unseated.push({ reason: "share dropped" })
		return
	}
	STATE.releaseFaction({
		state,
		p: seat,
		supporters: share.supporters,
		ruler: { dynasty: run.late.dynasty, age: "inherited", claim: HEIR_CLAIM },
		rng,
	})
	run.released.push({
		...share,
		ruler: STATE_RULERS.ref({
			state,
			ruler: STATE_RULERS.read({ state, p: seat }),
		}),
	})
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

function skip({ state, realm, late, primary, reason }: SkipParams): number {
	state.events.push({
		tag: "partition skipped",
		time: state.time,
		data: {
			nation: realm,
			government: ERAS.governmentTypes[state.governmentType[realm]],
			reason,
			...STATE_RULERS.noteFields({ prefix: "late", ref: late }),
			...STATE_RULERS.noteFields({ prefix: "primary", ref: primary }),
		},
	})
	return 0
}

function note({ run, primary }: NoteParams): void {
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
		government: ERAS.governmentTypes[state.governmentType[realm]],
		primaryRankBefore: before.topTier,
		populationBefore: before.population,
		provincesBefore: before.provinces.length,
		seats: heirSeats,
		shareKind: run.released.map((share) => share.kind),
		realms,
		realmKind: realms.map(kind),
		realmPopulation: realms.map((root) => population.get(root) ?? 0),
		realmProvinces: realms.map((root) => provinces.get(root) ?? 0),
		realmRank: realms.map((root) =>
			STATE_TITLES.topTier({ state, realm: root }),
		),
		joinedDistricts: run.joined.map((join) => join.district),
		joinedRealms: run.joined.map((join) => join.realm),
		unseatedReasons: run.unseated.map((entry) => entry.reason),
		titlesLost,
		titlesLostTier: titlesLost.map((title) => state.titles.tier[title]),
		...STATE_RULERS.noteFields({ prefix: "late", ref: run.late }),
		...STATE_RULERS.noteFields({ prefix: "primary", ref: primary }),
		...STATE_RULERS.noteColumns({
			prefix: "heir",
			refs: run.released.map((share) => share.ruler),
		}),
	}
	state.events.push({ tag: "partition", time: state.time, data })
}

function divide({
	state,
	realm,
	juniors,
	late,
	primary,
	rng,
}: DivideParams): number {
	if (
		!GOVERNMENT.partitionsOfIndex(state.governmentType[realm]) ||
		!STATE.isSovereign({ state, p: realm })
	)
		return 0
	if (juniors === 0)
		return skip({ state, realm, late, primary, reason: "no junior heir" })
	const run: PartitionRun = {
		state,
		realm,
		rng,
		snapshot: snapshot({ state, realm }),
		late,
		released: [],
		unseated: [],
		joined: [],
	}
	for (const share of allocate({
		state,
		realm,
		unseated: run.unseated,
		count: juniors,
	}))
		release({ run, share })
	if (run.released.length === 0)
		return skip({ state, realm, late, primary, reason: "no free seat" })
	resolveCutOff(run)
	note({ run, primary })
	return run.released.length
}

export const PARTITION = { divide }
