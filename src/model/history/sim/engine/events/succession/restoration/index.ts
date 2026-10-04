import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import type {
	AttemptParams,
	DeposeParams,
	DueParams,
	LapseParams,
	RestorationRevolt,
} from "@/model/history/sim/engine/events/succession/restoration/types"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { HEIRS } from "@/model/history/sim/people/heirs"

// Chance that a claimant tries, by generation; the claim lapses after the
// last.
const TRY_CHANCE = [0.5, 0.25]
const WEAK_RULER_FACTOR = 2
const WEAK_CLAIM = 1

function depose({ state, realm, claimant }: DeposeParams): void {
	state.people.deposed.set(realm, { claimant, generation: 0, tried: false })
}

function lapse({ state, realm, claimant }: LapseParams): void {
	state.people.deposed.delete(realm)
	state.events.push({
		tag: "claim lapsed",
		time: state.time,
		data: { nation: realm, claimant },
	})
}

// Passes each dead claimant's claim to their eldest child, drops claims
// that lapsed or were fulfilled, and returns the realms whose claimant has
// just come of age.
function due({ state }: DueParams): number[] {
	const people = state.people
	const time = state.time / STATE.yearMs
	const ready: number[] = []
	for (const [realm, claim] of [...people.deposed]) {
		if (!STATE.isSovereign({ state, p: realm })) {
			lapse({ state, realm, claimant: claim.claimant })
			continue
		}
		if (people.rulerOf[realm] === claim.claimant) {
			people.deposed.delete(realm)
			continue
		}
		let current = claim
		if (!PEOPLE.aliveAt({ people, person: claim.claimant, time })) {
			const { heir, relation } = HEIRS.of({
				people,
				dying: claim.claimant,
				time,
				preference: SUCCESSION_SYSTEMS.preferenceOf({ state, realm }),
				eligible: (person) => SUCCESSION_SYSTEMS.available({ state, person }),
			})
			const generation = claim.generation + 1
			if (relation !== "child" || generation >= TRY_CHANCE.length) {
				lapse({ state, realm, claimant: claim.claimant })
				continue
			}
			current = { claimant: heir, generation, tried: false }
			people.deposed.set(realm, current)
			PEOPLE.record({ people, person: heir })
		}
		if (
			!current.tried &&
			SUCCESSION_SYSTEMS.adultAvailable({ state, person: current.claimant })
		) {
			current.tried = true
			ready.push(realm)
		}
	}
	return ready
}

// A claimant of age may press their claim, more readily against a child or
// a ruler of weak claim; with enough backing a district rises for them.
function attempt({
	state,
	realm,
	rng,
}: AttemptParams): RestorationRevolt | null {
	const people = state.people
	const claim = people.deposed.get(realm)
	const ruler = people.rulerOf[realm]
	if (!claim?.tried || ruler < 0 || ruler === claim.claimant) return null
	const claimant = claim.claimant
	if (!SUCCESSION_SYSTEMS.adultAvailable({ state, person: claimant }))
		return null
	const weak =
		REGENCY.active({ state, realm }) !== null ||
		state.leaderClaimCurrent[realm] <= WEAK_CLAIM
	const chance = Math.min(
		1,
		TRY_CHANCE[claim.generation] *
			(weak ? WEAK_RULER_FACTOR : 1) *
			(GOVERNOR.personHas({ state, person: claimant, trait: "ambitious" })
				? 1.5
				: GOVERNOR.personHas({ state, person: claimant, trait: "content" })
					? 0.5
					: 1),
	)
	if (rng.random() >= chance) return null
	const contest = SUCCESSION_SYSTEMS.challenge({
		state,
		realm,
		incumbent: ruler,
		claimant,
		rng,
	})
	state.events.push({
		tag: "restoration attempt",
		time: state.time,
		data: {
			nation: realm,
			claimant,
			generation: claim.generation,
			backed: contest.backed,
			revolt: contest.seat >= 0,
		},
	})
	if (contest.seat < 0) return null
	people.deposed.delete(realm)
	return {
		claimant,
		seat: contest.seat,
		supportingSeats: contest.supportingSeats,
	}
}

export const RESTORATION = { depose, due, attempt }
