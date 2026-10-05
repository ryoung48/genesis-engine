import { BACKFILL } from "@/model/history/sim/engine/backfill"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { DEATH_SCHEDULE } from "@/model/history/sim/engine/events/people/death/schedule"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { PATRICIANS } from "@/model/history/sim/engine/events/people/patricians"
import { ROYAL_MARRIAGES } from "@/model/history/sim/engine/events/people/royal-marriages"
import { STRESS_EVENTS } from "@/model/history/sim/engine/events/people/stress"
import type {
	FailHeartsParams,
	InitPeopleParams,
	PeopleEventParams,
	SettleMatchesParams,
	StateParams,
} from "@/model/history/sim/engine/events/people/types"
import { SUCCESSION_PROJECTION } from "@/model/history/sim/engine/events/succession/projection"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { LIVE_OPINION_CONTEXT } from "@/model/history/sim/engine/opinion-context"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { BETROTHAL } from "@/model/history/sim/people/betrothal"
import { FAMILY } from "@/model/history/sim/people/family"
import { MARRIAGE_DIAGNOSTICS } from "@/model/history/sim/people/family/diagnostics"
import { STARTING_RANDOM } from "@/model/history/sim/people/family/starting/random"
import { HEALTH } from "@/model/history/sim/people/health"
import { AGEING } from "@/model/history/sim/people/health/ageing"
import { HOLDINGS } from "@/model/history/sim/people/holdings"
import { OPINION } from "@/model/history/sim/people/opinion"
import type { OpinionPerson } from "@/model/history/sim/people/opinion/types"
import type {
	CrossMatch,
	MarriageRealms,
} from "@/model/history/sim/people/types"

// Every royal child aged 12-15 at the start seeks a betrothal once. The start
// still holds about a third fewer standing betrothals than years 20-30.
const START_BETROTHAL_SHARE = 1

function nextYear({ state }: StateParams): void {
	state.heap.enqueue(
		state.time + STATE.deltaYear(1),
		EVENT_HEAP.evt.PEOPLE_YEAR,
		0,
		0,
	)
}

function marriageRealms({ state }: StateParams): MarriageRealms {
	const neighbors = new Map<number, number[]>()
	const contexts = new Map<number, OpinionPerson>()
	let districtHeirs = new Map<number, number>()
	let crownHeirs = new Map<number, number>()
	let stale: "all" | "crowns" | "none" = "all"
	const people = state.people
	const table = people.persons
	const time = state.time / STATE.yearMs
	const live = LIVE_OPINION_CONTEXT.of({ state, time })
	const personOf = (person: number): OpinionPerson | null => {
		const cached = contexts.get(person)
		if (cached) return cached
		state.opinionPolitics.marriageCacheMisses++
		const value = live.personOf(person)
		if (value) contexts.set(person, value)
		return value
	}
	const context = { ...live, personOf }

	return {
		observe: (observation) => {
			const year = observation.time
			const totals =
				state.marriageMarket.get(year) ?? MARRIAGE_DIAGNOSTICS.create()
			MARRIAGE_DIAGNOSTICS.observe({ totals, observation })
			state.marriageMarket.set(year, totals)
		},
		opinionContext: () => context,
		candidateOf: (person) => ({
			currentStanding: HOLDINGS.standing({
				people,
				person,
				ranks: state.seatRank,
			}),
			projectedStanding: Math.max(
				districtHeirs.get(person) ?? 0,
				crownHeirs.get(person) ?? 0,
			),
			sovereignTiers: (personOf(person)?.sovereignSeats ?? []).map(
				(seat) => state.seatRank[seat],
			),
			attractionModifier: AGEING.effectsOf({ people, person })?.attraction ?? 0,
		}),
		allied: (match) =>
			match.realmA !== match.realmB &&
			STATE.getRelation({ state, a: match.realmA, b: match.realmB }) ===
				STATE.rel.ALLY,
		onboard: (person) => {
			table.createdAt[person] = time
			DEATH_SCHEDULE.ensure({ state, person, cause: "natural" })
			contexts.delete(person)
		},
		settle: ({ match, betrothal }) => {
			const united = settleMatches({
				state,
				matches: {
					weddings: betrothal ? [] : [match],
					betrothals: betrothal ? [match] : [],
				},
			})
			if (united && stale === "none") stale = "crowns"
			return united
		},
		// A match moves a household and may ally two realms, neither of which
		// changes a holder or an heir. Only a union changes who may inherit a
		// crown, and no match changes the line of a district.
		refresh: () => {
			contexts.clear()
			if (stale === "none") return
			neighbors.clear()
			const started = performance.now()
			if (stale === "all")
				districtHeirs = SUCCESSION_PROJECTION.districts({ state })
			crownHeirs = SUCCESSION_PROJECTION.crowns({ state })
			stale = "none"
			const totals =
				state.marriageMarket.get(time) ?? MARRIAGE_DIAGNOSTICS.create()
			MARRIAGE_DIAGNOSTICS.observe({
				totals,
				observation: {
					kind: "projection",
					time,
					ms: performance.now() - started,
				},
			})
			state.marriageMarket.set(time, totals)
		},
		neighborsOf: (realm) => {
			const cached = neighbors.get(realm)
			if (cached) return cached
			const list = STATE.isSovereign({ state, p: realm })
				? STATE.getNationNeighbors({ state, nation: realm })
				: []
			neighbors.set(realm, list)
			return list
		},
		originOf: (realm) => STATE.originOf({ state, realm }),
		royal: (realm) =>
			STATE.isSovereign({ state, p: realm }) &&
			GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[realm]),
		alliable: (match: CrossMatch) => ROYAL_MARRIAGES.alliable({ state, match }),
	}
}

function sovereignRulers({ state }: StateParams): number[] {
	const people = state.people
	const rulers: number[] = []
	for (let seat = 0; seat < state.P; seat++)
		if (people.rulerOf[seat] >= 0 && STATE.isSovereign({ state, p: seat }))
			rulers.push(people.rulerOf[seat])
	return rulers
}

// Marriage alliances from the year's matches, and heiress unions from its
// weddings. A betrothal whose alliance cannot hold is broken at once. Returns
// whether a union was founded, which always records an event.
function settleMatches({ state, matches }: SettleMatchesParams): boolean {
	const people = state.people
	let united = false
	for (const match of matches.betrothals)
		if (!ROYAL_MARRIAGES.allianceFromMatch({ state, match }))
			BETROTHAL.release({
				people,
				person: match.a,
				time: state.time / STATE.yearMs,
				cause: "alliance",
			})
	for (const match of matches.weddings) {
		ROYAL_MARRIAGES.allianceFromMatch({ state, match })
		if (people.rulerOf[match.realmA] !== match.a) continue
		const events = state.events.length
		STATE.uniteCouple({ state, p: match.realmA, person: match.a })
		if (state.events.length !== events) united = true
	}
	return united
}

function init({ state, seed }: InitPeopleParams): void {
	BACKFILL.houses({ state, seed })
	const started = performance.now()
	FAMILY.seekMatches({
		people: state.people,
		time: state.time / STATE.yearMs,
		seekers: [],
		sovereigns: sovereignRulers({ state }),
		minorChance: START_BETROTHAL_SHARE,
		rng: STARTING_RANDOM.source({ seed, path: [0], purpose: 8 }),
		...marriageRealms({ state }),
	})
	state.people.startingFamilies.betrothalsMs = performance.now() - started
	nextYear({ state })
}

// Every failed heart is dated before any succession runs, so no one who dies
// this instant is chosen as an heir or regent; the deaths then apply in
// person order.
function failHearts({ state, hearts, rng }: FailHeartsParams): void {
	if (hearts.length === 0) return
	for (const person of hearts)
		PERSON_DEATH.mark({ state, person, cause: "heart" })
	for (const person of hearts)
		PERSON_DEATH.run({
			state,
			person,
			revision: DEATH_SCHEDULE.revisionOf({ state, person }),
			rng,
		})
	const people = state.people
	const time = state.time / STATE.yearMs
	people.stressed = people.stressed.filter(
		(person) =>
			PEOPLE.aliveAt({ people, person, time }) &&
			people.persons.heldSeats[person].some((seat) =>
				STATE.isSovereign({ state, p: seat }),
			),
	)
}

function runYear({ state, rng }: PeopleEventParams): void {
	failHearts({ state, hearts: STRESS_EVENTS.runYear({ state }), rng })
	const health = HEALTH.runYear({
		people: state.people,
		time: state.time / STATE.yearMs,
	})
	for (const person of health.dying)
		DEATH_SCHEDULE.ensure({ state, person, cause: "natural" })
	for (const person of health.incapacitated)
		for (const realm of [...state.people.persons.heldSeats[person]])
			REGENCY.startIncapacity({ state, realm })
	DISTRICTS.settle({ state, rng })
	DISTRICTS.grant({
		found: null,
		randomOf: null,
		recordOpinionMemory: true,
		state,
		rng,
	})
	ROYAL_MARRIAGES.review({ state })
	PATRICIANS.settle({ found: null, state, rng })
	const people = state.people
	const rulers: number[] = []
	for (let seat = 0; seat < state.P; seat++)
		if (people.rulerOf[seat] >= 0) rulers.push(people.rulerOf[seat])
	for (const heads of people.patricians.values()) rulers.push(...heads)
	const time = state.time / STATE.yearMs
	const realms = marriageRealms({ state })
	FAMILY.runYear({
		people,
		time,
		rulers,
		sovereigns: sovereignRulers({ state }),
		rng,
		...realms,
	})
	FAMILY.project({
		people,
		time,
		rulers,
		originOf: realms.originOf,
		rng,
	})
	ROYAL_MARRIAGES.review({ state })
	OPINION.prune({ people, time })
	nextYear({ state })
}

export const PEOPLE_EVENTS = { init, runYear }
