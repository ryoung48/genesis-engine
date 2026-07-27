import { EVENT_HEAP } from "@/model/history/generated/event-heap"
import type {
	CanBeRivalsParams,
	CanVassalizeParams,
	ClassifyInitialNeighborRelationParams,
	InitDiplomacyParams,
	NextEventParams,
	ProcessPersonalUnionDiplomacyParams,
	ProcessVassalDiplomacyParams,
	RollTransitionParams,
	RunDiplomacyParams,
	SeedInitialPersonalUnionsParams,
	SeedInitialVassalsParams,
	SeedNeighborRelationsParams,
	SeedSharedDynastiesParams,
	SyncVassalRelationsParams,
} from "@/model/history/generated/events/diplomacy/types"
import { FIELDS } from "@/model/history/generated/fields"
import { type Relation, STATE } from "@/model/history/generated/state"
import type { HistoryState } from "@/model/history/generated/state/types"
import type { WeightedValue } from "@/model/shared/random/rng"

const LADDER_STATES = [
	STATE.rel.RIVAL,
	STATE.rel.SUSPICIOUS,
	STATE.rel.NEUTRAL,
	STATE.rel.FRIENDLY,
	STATE.rel.ALLY,
] as const

const INITIAL_RELATION_POOL: ReadonlyArray<WeightedValue<Relation>> = [
	{ v: STATE.rel.RIVAL, w: 8 },
	{ v: STATE.rel.SUSPICIOUS, w: 20 },
	{ v: STATE.rel.NEUTRAL, w: 42 },
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
	const aW = STATE.wealthOptimal({ state, p: a })
	const bW = STATE.wealthOptimal({ state, p: b })
	const ratio = Math.min(aW, bW) / Math.max(aW, bW)
	return ratio >= 0.8
}

function canVassalize({
	state,
	a,
	b,
}: CanVassalizeParams): { vassal: number; overlord: number } | null {
	const aW = STATE.wealthOptimal({ state, p: a })
	const bW = STATE.wealthOptimal({ state, p: b })
	const ratio = Math.min(aW, bW) / Math.max(aW, bW)
	if (ratio >= 0.5) return null
	return aW <= bW ? { vassal: a, overlord: b } : { vassal: b, overlord: a }
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

	const threat = STATE.warThreat({
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
		STATE.startWar({
			state,
			attacker: overlord,
			defender: vassal,
			rng,
			rebel: false,
		})
	}
}

function processPersonalUnionDiplomacy({
	state,
	junior,
	senior,
	rng,
}: ProcessPersonalUnionDiplomacyParams): void {
	syncVassalRelations({ state, vassal: junior, overlord: senior })

	const threat = STATE.warThreat({ state, attacker: senior, defender: junior })
	if (threat <= 0.6) return

	// Break union
	STATE.setRelation({ state, a: junior, b: senior, rel: STATE.rel.SUSPICIOUS })
	state.events.push({
		tag: "personal union ended",
		time: state.time,
		data: { junior, senior },
	})

	const counterWarChance = 0.7 * (1 - threat)
	if (rng.random() < counterWarChance) {
		STATE.startWar({
			state,
			attacker: senior,
			defender: junior,
			rng,
			rebel: false,
		})
	}
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
			const aW = STATE.wealthOptimal({ state, p: nation })
			const bW = STATE.wealthOptimal({ state, p: neighbor })
			const ratio = aW / Math.max(1, bW)
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

const SHARED_DYNASTY_SEED_CHANCE = 0.25

const PERSONAL_UNION_SEED_CHANCE = SHARED_DYNASTY_SEED_CHANCE / 5

function seedSharedDynasties({ state, rng }: SeedSharedDynastiesParams): void {
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation] || !STATE.isSovereign({ state, p: nation }))
			continue
		for (const nb of STATE.getNationNeighbors({ state, nation })) {
			if (nb <= nation) continue
			const rel = STATE.getRelation({ state, a: nation, b: nb })
			if (rel !== STATE.rel.FRIENDLY && rel !== STATE.rel.ALLY) continue
			if (rng.random() >= SHARED_DYNASTY_SEED_CHANCE) continue

			const [senior, junior] =
				STATE.wealthOptimal({ state, p: nation }) >=
				STATE.wealthOptimal({ state, p: nb })
					? [nation, nb]
					: [nb, nation]
			const seniorDynasty = FIELDS.prov.leader.dynasty.get({ state, p: senior })
			if (
				seniorDynasty === FIELDS.prov.leader.dynasty.get({ state, p: junior })
			)
				continue

			FIELDS.prov.leader.dynasty.set({
				state,
				p: junior,
				time: state.time,
				value: seniorDynasty,
			})
			state.events.push({
				tag: "dynasty spread",
				time: state.time,
				data: { nation: junior, source: senior, dynasty: seniorDynasty },
			})
		}
	}
}

function seedInitialPersonalUnions({
	state,
	rng,
}: SeedInitialPersonalUnionsParams): void {
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation] || !STATE.isSovereign({ state, p: nation }))
			continue
		if (STATE.getRulerRelation({ state, nation })) continue
		for (const nb of STATE.getNationNeighbors({ state, nation })) {
			if (nb <= nation) continue
			if (STATE.getRulerRelation({ state, nation: nb })) continue
			const rel = STATE.getRelation({ state, a: nation, b: nb })
			if (rel !== STATE.rel.FRIENDLY && rel !== STATE.rel.ALLY) continue
			if (
				FIELDS.prov.leader.dynasty.get({ state, p: nation }) !==
				FIELDS.prov.leader.dynasty.get({ state, p: nb })
			)
				continue
			if (rng.random() >= PERSONAL_UNION_SEED_CHANCE) continue

			const [senior, junior] =
				STATE.wealthOptimal({ state, p: nation }) >=
				STATE.wealthOptimal({ state, p: nb })
					? [nation, nb]
					: [nb, nation]
			STATE.setRelation({
				state,
				a: junior,
				b: senior,
				rel: STATE.rel.PU_JUNIOR,
			})
			state.events.push({
				tag: "personal union formed",
				time: state.time,
				data: { junior, senior },
			})
		}
	}
}

function initDiplomacy({ state, rng }: InitDiplomacyParams): void {
	seedSubjectRelations(state)
	seedNeighborRelations({ state, rng })
	seedInitialVassals({ state, rng })
	seedSharedDynasties({ state, rng })
	seedInitialPersonalUnions({ state, rng })
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
	for (let other = 0; other < state.P; other++) {
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

		if (rel === STATE.rel.OVERLORD || rel === STATE.rel.PU_SENIOR) continue
		if (rel === STATE.rel.WAR) continue
		if (rel === STATE.rel.COLONY) continue // colonizer's view of a distant colony

		if (rel === STATE.rel.VASSAL) {
			processVassalDiplomacy({ state, vassal: nb, overlord: nation, rng })
			continue
		}

		if (rel === STATE.rel.PU_JUNIOR) {
			processPersonalUnionDiplomacy({ state, junior: nb, senior: nation, rng })
			continue
		}

		const next = rollTransition({ current: rel, rng })
		if (next === rel) continue

		// Ally → vassalize if wealth ratio < 50%
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
