import type {
	BackfillParams,
	CousinPair,
	CousinsParams,
	FreshHouseParams,
	ReconcileParams,
} from "@/model/history/sim/engine/backfill/types"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { PATRICIANS } from "@/model/history/sim/engine/events/people/patricians"
import { STATE } from "@/model/history/sim/engine/state"
import { STARTING_FAMILY } from "@/model/history/sim/people/family/starting"
import { STARTING_ANCHORS } from "@/model/history/sim/people/family/starting/anchors"
import type { StartingHouse } from "@/model/history/sim/people/family/starting/anchors/types"
import { STARTING_RANDOM } from "@/model/history/sim/people/family/starting/random"
import { HEALTH } from "@/model/history/sim/people/health"
import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { HASH } from "@/model/shared/random/hash"
import { RNG } from "@/model/shared/random/rng"

function cousins({ state, seed, houses }: CousinsParams): void {
	const metrics = state.people.startingFamilies
	const bySeat = new Map(houses.map((house) => [house.seat, house]))
	const candidates: CousinPair[] = []
	for (const a of houses)
		for (const neighbor of [
			...new Set(STATE.getNationNeighbors({ state, nation: a.seat })),
		].sort((a, b) => a - b)) {
			const b = bySeat.get(neighbor)
			if (!b || a.seat >= b.seat) continue
			metrics.cousinCandidates++
			const pairSeed = STARTING_RANDOM.key({ seed, path: [a.seat, b.seat] })
			if (HASH.unit({ seed: pairSeed, channel: 6010, salt: 0 }) >= 0.25)
				continue
			metrics.cousinProposals++
			candidates.push({
				a,
				b,
				priority: HASH.unit({ seed: pairSeed, channel: 6011, salt: 0 }),
			})
		}
	candidates.sort(
		(a, b) =>
			a.priority - b.priority || a.a.seat - b.a.seat || a.b.seat - b.b.seat,
	)
	const used = new Set<number>()
	for (const { a, b } of candidates) {
		const fatherA = a.holder.father
		const fatherB = b.holder.father
		const gap =
			fatherA && fatherB ? Math.abs(fatherA.birth - fatherB.birth) : Infinity
		const reason =
			used.has(a.seat) || used.has(b.seat)
				? "already paired"
				: !fatherA ||
						!fatherB ||
						fatherA.father ||
						fatherA.mother ||
						fatherB.father ||
						fatherB.mother
					? "established ancestry"
					: gap < STARTING_ANCHORS.spacing || gap > 12
						? "birth spacing"
						: null
		if (reason) {
			metrics.cousinRejections[reason] =
				(metrics.cousinRejections[reason] ?? 0) + 1
			continue
		}
		if (!fatherA || !fatherB) throw new Error("Missing cousin anchors")
		STARTING_ANCHORS.bridge({
			path: [...a.path, 9, b.seat],
			origin: a.holder.origin,
			older: fatherA.birth < fatherB.birth ? fatherA : fatherB,
			younger: fatherA.birth < fatherB.birth ? fatherB : fatherA,
		})
		used.add(a.seat)
		used.add(b.seat)
		metrics.cousinPairs++
	}
}

function reconcile({ state, first }: ReconcileParams): void {
	const people = state.people
	const table = people.persons
	const time = state.time / STATE.yearMs
	people.alive = people.alive.filter((person) => table.death[person] > time)
	for (let person = 0; person < table.sex.length; person++) {
		const spouse = table.spouse[person]
		if (
			spouse >= 0 &&
			(table.death[person] <= time || table.death[spouse] <= time)
		) {
			table.spouse[person] = -1
			table.marriedAt[person] = -1
		}
		if (table.death[person] > time) {
			HOUSEHOLD.seatChanged({ people, person })
			if (person >= first) HEALTH.snapshot({ people, person })
		}
	}
}

function sovereigns({ state, seed }: BackfillParams): void {
	const started = performance.now()
	const houses: StartingHouse[] = []
	const people = state.people
	for (let seat = 0; seat < state.P; seat++) {
		if (
			!STATE.isSovereign({ state, p: seat }) ||
			state.stateless[seat] ||
			state.desolate[seat]
		)
			continue
		const path = [0, seat]
		houses.push(
			STARTING_ANCHORS.house({
				seed,
				path,
				seat,
				origin: STATE.originOf({ state, realm: seat }),
				time: state.time / STATE.yearMs,
				age: STARTING_RANDOM.rulerAge({
					rng: STARTING_RANDOM.source({ seed, path: [...path, 0], purpose: 0 }),
				}),
				rank: state.seatRank[seat],
				sovereign: true,
			}),
		)
	}
	cousins({ state, seed, houses })
	STARTING_ANCHORS.materialize({
		people,
		seed,
		anchors: houses.flatMap((house) =>
			house.predecessor ? [house.holder, house.predecessor] : [house.holder],
		),
	})
	people.startingFamilies.anchorCount = people.persons.sex.length
	for (const house of houses) {
		const person = STARTING_FAMILY.materialize({ people, house })
		if (house.predecessor && house.proposal && house.relation) {
			const metrics = people.startingFamilies
			metrics.predecessorProposals[house.proposal] =
				(metrics.predecessorProposals[house.proposal] ?? 0) + 1
			metrics.predecessors[house.relation] =
				(metrics.predecessors[house.relation] ?? 0) + 1
			if (house.fallback)
				metrics.fallbacks[house.fallback] =
					(metrics.fallbacks[house.fallback] ?? 0) + 1
			people.log.initialTenures.push(
				{
					person: house.predecessor.person,
					seat: house.seat,
					kind: "ruler",
					start: null,
					end: house.accession,
					startReason: "unknown",
					endReason: "succession",
				},
				{
					person,
					seat: house.seat,
					kind: "ruler",
					start: house.accession,
					end: Infinity,
					startReason: "succession",
					endReason: null,
				},
			)
		}
		STATE.installRuler({
			state,
			p: house.seat,
			person,
			claim: 3,
			reason: "unknown",
		})
	}
	reconcile({ state, first: 0 })
	people.startingFamilies.sovereignsMs = performance.now() - started
}

function fresh({ state, seed, kind, seat, slot }: FreshHouseParams): number {
	const path = [kind, seat, slot]
	const rng = STARTING_RANDOM.source({ seed, path: [...path, 0], purpose: 0 })
	const origin = STATE.originOf({ state, realm: seat })
	const house = STARTING_ANCHORS.house({
		seed,
		path,
		seat,
		origin:
			kind === 1 ? { ...origin, realm: state.sovereignCurrent[seat] } : origin,
		time: state.time / STATE.yearMs,
		age: kind === 1 ? rng.uniform(18, 55) : rng.uniform(25, 60),
		rank: kind === 1 ? state.seatRank[seat] : 0,
		sovereign: false,
	})
	const before = state.people.persons.sex.length
	STARTING_ANCHORS.materialize({
		people: state.people,
		seed,
		anchors: [house.holder],
	})
	state.people.startingFamilies.anchorCount +=
		state.people.persons.sex.length - before
	return STARTING_FAMILY.materialize({ people: state.people, house })
}

function houses({ state, seed }: BackfillParams): void {
	const first = state.people.persons.sex.length
	const started = performance.now()
	const metrics = state.people.startingFamilies
	const rng = STARTING_RANDOM.source({ seed, path: [1], purpose: 7 })
	DISTRICTS.grant({
		state,
		rng,
		found: (seat) => {
			metrics.freshDistricts++
			return fresh({ state, seed, kind: 1, seat, slot: 0 })
		},
		randomOf: (seat) => {
			let counter = 0
			return RNG.fromSource({
				random: () =>
					HASH.unit({
						seed: STARTING_RANDOM.key({ seed, path: [1, seat] }),
						channel: 6012,
						salt: counter++,
					}),
				nonPositiveWeightBehavior: "undefined",
			})
		},
	})
	PATRICIANS.settle({
		state,
		rng,
		found: ({ realm, slot }) => {
			metrics.patricianHeads++
			return fresh({ state, seed, kind: 2, seat: realm, slot })
		},
	})
	reconcile({ state, first })
	metrics.housesMs = performance.now() - started
}

export const BACKFILL = { sovereigns, houses }
