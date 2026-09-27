import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import type {
	CanBeRivalsParams,
	CanVassalizeParams,
	ClassifyInitialNeighborRelationParams,
	InitDiplomacyParams,
	MarriageBoundParams,
	NextEventParams,
	ProcessVassalDiplomacyParams,
	RollTransitionParams,
	RunDiplomacyParams,
	SeedInitialVassalsParams,
	SeedNeighborRelationsParams,
	SyncVassalRelationsParams,
} from "@/model/history/sim/engine/events/diplomacy/types"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { WAR } from "@/model/history/sim/engine/events/war"
import { MILITARY } from "@/model/history/sim/engine/military"
import { type Relation, STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import type { WeightedValue } from "@/model/shared/random/rng"

const LADDER_STATES = [
	STATE.rel.RIVAL,
	STATE.rel.SUSPICIOUS,
	STATE.rel.NEUTRAL,
	STATE.rel.FRIENDLY,
	STATE.rel.ALLY,
] as const

const INITIAL_RELATION_POOL: ReadonlyArray<WeightedValue<Relation>> = [
	{ v: STATE.rel.RIVAL, w: 3 },
	{ v: STATE.rel.SUSPICIOUS, w: 10 },
	{ v: STATE.rel.NEUTRAL, w: 57 },
	{ v: STATE.rel.FRIENDLY, w: 22 },
	{ v: STATE.rel.ALLY, w: 8 },
]

const TRANSITION_MATRIX: Record<Relation, number[] | undefined> = {
	[STATE.rel.NONE]: undefined,
	[STATE.rel.OVERLORD]: undefined,
	[STATE.rel.VASSAL]: undefined,
	[STATE.rel.PU_SENIOR]: undefined,
	[STATE.rel.PU_JUNIOR]: undefined,
	[STATE.rel.RIVAL]: [0.65, 0.25, 0.08, 0.02, 0.0],
	[STATE.rel.SUSPICIOUS]: [0.18, 0.5, 0.22, 0.05, 0.05],
	[STATE.rel.NEUTRAL]: [0.05, 0.18, 0.5, 0.15, 0.12],
	[STATE.rel.FRIENDLY]: [0.02, 0.1, 0.2, 0.45, 0.23],
	[STATE.rel.ALLY]: [0.01, 0.04, 0.1, 0.2, 0.65],
	[STATE.rel.WAR]: undefined,
	[STATE.rel.COLONY]: undefined,
}

function rollTransition({ current, rng }: RollTransitionParams): Relation {
	const row = TRANSITION_MATRIX[current]
	if (!row) return current
	let roll = rng.random()
	for (let i = 0; i < row.length; i++) {
		roll -= row[i]
		if (roll <= 0) return LADDER_STATES[i]
	}
	return LADDER_STATES[LADDER_STATES.length - 1]
}

function canBeRivals({ state, a, b }: CanBeRivalsParams): boolean {
	const aR = ECONOMY.revenue({ state, p: a })
	const bR = ECONOMY.revenue({ state, p: b })
	const ratio = Math.min(aR, bR) / Math.max(aR, bR)
	return ratio >= 0.8
}

function canVassalize({
	state,
	a,
	b,
}: CanVassalizeParams): { vassal: number; overlord: number } | null {
	const aR = ECONOMY.revenue({ state, p: a })
	const bR = ECONOMY.revenue({ state, p: b })
	const ratio = Math.min(aR, bR) / Math.max(aR, bR)
	if (ratio >= 0.5) return null
	return aR <= bR ? { vassal: a, overlord: b } : { vassal: b, overlord: a }
}

function syncVassalRelations({
	state,
	vassal,
	overlord,
}: SyncVassalRelationsParams): void {
	const vassalNeighbors = STATE.getNationNeighbors({ state, nation: vassal })
	for (const nb of vassalNeighbors) {
		if (nb === overlord) continue
		const vassalRel = STATE.getRelation({ state, a: vassal, b: nb })
		if (
			vassalRel === STATE.rel.VASSAL ||
			vassalRel === STATE.rel.OVERLORD ||
			vassalRel === STATE.rel.PU_SENIOR ||
			vassalRel === STATE.rel.PU_JUNIOR ||
			vassalRel === STATE.rel.COLONY
		)
			continue

		const overlordRel = STATE.getRelation({ state, a: overlord, b: nb })
		if (
			overlordRel === STATE.rel.SUSPICIOUS ||
			overlordRel === STATE.rel.WAR ||
			overlordRel === STATE.rel.RIVAL
		) {
			STATE.setRelation({ state, a: vassal, b: nb, rel: STATE.rel.SUSPICIOUS })
		}
	}
}

function processVassalDiplomacy({
	state,
	vassal,
	overlord,
	rng,
}: ProcessVassalDiplomacyParams): void {
	syncVassalRelations({ state, vassal, overlord })

	const threat = MILITARY.threat({
		state,
		attacker: overlord,
		defender: vassal,
	})
	if (threat <= 0.4) return

	// Break vassalage
	STATE.setRelation({
		state,
		a: vassal,
		b: overlord,
		rel: STATE.rel.SUSPICIOUS,
	})
	state.events.push({
		tag: "vassalage ended",
		time: state.time,
		data: { vassal, overlord },
	})

	// Probabilistic counter-war
	const counterWarChance = 0.7 * (1 - threat)
	if (rng.random() < counterWarChance) {
		WAR.start({
			state,
			attacker: overlord,
			defender: vassal,
			rng,
			rebel: false,
		})
	}
}

// An alliance holds while the two ruling families stay joined by a living
// marriage, or while one realm's regent parent was born into the other's
// ruling house.
function marriageBound({ state, a, b }: MarriageBoundParams): boolean {
	const people = state.people
	const rulerA = people.rulerOf[a]
	const rulerB = people.rulerOf[b]
	return (
		rulerA >= 0 &&
		rulerB >= 0 &&
		GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[a]) &&
		GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[b]) &&
		(PEOPLE.tiedByMarriage({
			people,
			a: rulerA,
			b: rulerB,
			time: state.time / STATE.yearMs,
		}) ||
			REGENCY.bindsTo({ state, realm: a, other: b }) ||
			REGENCY.bindsTo({ state, realm: b, other: a }))
	)
}

function nextEvent({ state, province, rng, years }: NextEventParams): void {
	state.heap.enqueue(
		state.time + STATE.deltaYear(years ?? rng.uniform(8, 15)),
		EVENT_HEAP.evt.DIPLOMACY,
		province,
		0,
		0,
		0,
		state.time,
	)
}

function seedSubjectRelations(state: HistoryState): void {
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation]) continue
		const overlord = state.parentCurrent[nation]
		if (overlord < 0) continue
		STATE.setRelation({ state, a: nation, b: overlord, rel: STATE.rel.VASSAL })
	}
}

function classifyInitialNeighborRelation({
	state,
	a,
	b,
	rng,
}: ClassifyInitialNeighborRelationParams): Relation {
	let relation = rng.weightedChoice(INITIAL_RELATION_POOL) ?? STATE.rel.NEUTRAL
	if (relation === STATE.rel.RIVAL && !canBeRivals({ state, a, b })) {
		relation = STATE.rel.SUSPICIOUS
	}
	return relation
}

function seedNeighborRelations({
	state,
	rng,
}: SeedNeighborRelationsParams): void {
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation] || !STATE.isSovereign({ state, p: nation }))
			continue
		for (const neighbor of STATE.getNationNeighbors({ state, nation })) {
			if (
				neighbor <= nation ||
				state.desolate[neighbor] ||
				!STATE.isSovereign({ state, p: neighbor })
			) {
				continue
			}
			// Don't overwrite colony-colonizer relations seeded by createHistoryState.
			const existing = STATE.getRelation({ state, a: nation, b: neighbor })
			if (existing === STATE.rel.COLONY || existing === STATE.rel.OVERLORD)
				continue
			const relation = classifyInitialNeighborRelation({
				state,
				a: nation,
				b: neighbor,
				rng,
			})
			if (relation !== STATE.rel.NEUTRAL) {
				STATE.setRelation({ state, a: nation, b: neighbor, rel: relation })
			}
		}
	}
}

const VASSAL_SEED_CHANCE = 0.4

const VASSAL_SEED_RATIO = 0.3

function seedInitialVassals({ state, rng }: SeedInitialVassalsParams): void {
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation] || !STATE.isSovereign({ state, p: nation }))
			continue
		if (STATE.getRulerRelation({ state, nation })) continue
		for (const neighbor of STATE.getNationNeighbors({ state, nation })) {
			if (
				state.desolate[neighbor] ||
				!STATE.isSovereign({ state, p: neighbor })
			)
				continue
			if (
				STATE.getRelation({ state, a: nation, b: neighbor }) ===
				STATE.rel.COLONY
			)
				continue
			if (
				STATE.getRelation({ state, a: nation, b: neighbor }) ===
				STATE.rel.OVERLORD
			)
				continue
			if (STATE.getRulerRelation({ state, nation: neighbor })) continue
			const aR = ECONOMY.revenue({ state, p: nation })
			const bR = ECONOMY.revenue({ state, p: neighbor })
			const ratio = aR / Math.max(1, bR)
			if (ratio >= VASSAL_SEED_RATIO) continue
			if (rng.random() >= VASSAL_SEED_CHANCE) continue
			STATE.setRelation({
				state,
				a: nation,
				b: neighbor,
				rel: STATE.rel.VASSAL,
			})
			break
		}
	}
}

function initDiplomacy({ state, rng }: InitDiplomacyParams): void {
	seedSubjectRelations(state)
	seedNeighborRelations({ state, rng })
	seedInitialVassals({ state, rng })
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		nextEvent({ state, province: p, rng, years: rng.uniform(0, 8) })
	}
}

function runDiplomacy({ state, nation, rng }: RunDiplomacyParams): void {
	if (!STATE.isSovereign({ state, p: nation })) {
		nextEvent({ state, province: nation, rng })
		return
	}

	const neighbors = STATE.getNationNeighbors({ state, nation })
	const neighborSet = new Set(neighbors)

	// Cleanup pass: drop non-neighbor relations to neutral
	const heldColumns = Array.from(state.relationColumns[nation]).sort(
		(a, b) => a - b,
	)
	for (const other of heldColumns) {
		if (other === nation || state.desolate[other]) continue
		const rel = STATE.getRelation({ state, a: nation, b: other })
		if (rel === STATE.rel.NONE || rel === STATE.rel.NEUTRAL) continue
		if (
			rel === STATE.rel.VASSAL ||
			rel === STATE.rel.OVERLORD ||
			rel === STATE.rel.PU_SENIOR ||
			rel === STATE.rel.PU_JUNIOR ||
			rel === STATE.rel.COLONY
		)
			continue

		if (!neighborSet.has(other) || !STATE.isSovereign({ state, p: other })) {
			STATE.setRelation({ state, a: nation, b: other, rel: STATE.rel.NEUTRAL })
		}
	}

	// Rival size-gate decay
	for (const nb of neighbors) {
		if (!STATE.isSovereign({ state, p: nb })) continue
		const rel = STATE.getRelation({ state, a: nation, b: nb })
		if (rel === STATE.rel.RIVAL && !canBeRivals({ state, a: nation, b: nb })) {
			STATE.setRelation({ state, a: nation, b: nb, rel: STATE.rel.SUSPICIOUS })
		}
	}

	// Standard diplomacy transitions
	for (const nb of neighbors) {
		if (!STATE.isSovereign({ state, p: nb })) continue
		const rel = STATE.getRelation({ state, a: nation, b: nb })

		if (
			rel === STATE.rel.OVERLORD ||
			rel === STATE.rel.PU_SENIOR ||
			rel === STATE.rel.PU_JUNIOR
		)
			continue
		if (rel === STATE.rel.WAR) continue
		if (rel === STATE.rel.COLONY) continue // colonizer's view of a distant colony

		if (rel === STATE.rel.VASSAL) {
			processVassalDiplomacy({ state, vassal: nb, overlord: nation, rng })
			continue
		}

		if (rel === STATE.rel.ALLY && marriageBound({ state, a: nation, b: nb }))
			continue

		const next = rollTransition({ current: rel, rng })
		if (next === rel) continue

		// Ally → vassalize if revenue ratio < 50%
		if (next === STATE.rel.ALLY) {
			const pair = canVassalize({ state, a: nation, b: nb })
			if (pair) {
				// Subject relations are relation-only; do not infer them from territory.
				if (
					!STATE.getRulerRelation({ state, nation: pair.vassal }) &&
					!STATE.getRulerRelation({ state, nation: pair.overlord })
				) {
					STATE.setRelation({
						state,
						a: pair.vassal,
						b: pair.overlord,
						rel: STATE.rel.VASSAL,
					})
					state.events.push({
						tag: "vassalized",
						time: state.time,
						data: {
							vassal: pair.vassal,
							overlord: pair.overlord,
						},
					})
					continue
				}
			}
		}

		// Rival size-gate
		if (next === STATE.rel.RIVAL && !canBeRivals({ state, a: nation, b: nb })) {
			if (rel !== STATE.rel.SUSPICIOUS) {
				STATE.setRelation({
					state,
					a: nation,
					b: nb,
					rel: STATE.rel.SUSPICIOUS,
				})
			}
			continue
		}

		STATE.setRelation({ state, a: nation, b: nb, rel: next })
	}

	nextEvent({ state, province: nation, rng })
}

export const DIPLOMACY = {
	initDiplomacy,
	runDiplomacy,
}
