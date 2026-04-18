/**
 * DIPLOMACY EVENT — relation transitions between nations.
 * Port of src/model/history/events/diplomacy.ts
 */

import { EVT } from "../heap"
import type { HistoryRng } from "../rng"
import {
	deltaYear,
	getNationNeighbors,
	getRelation,
	getRulerRelation,
	type HistoryState,
	isSovereign,
	REL,
	type Relation,
	setRelation,
	startWar,
	warThreat,
	wealthOptimal,
} from "../state"

// Diplomacy ladder states (indexed by position)
const LADDER_STATES = [
	REL.RIVAL,
	REL.SUSPICIOUS,
	REL.NEUTRAL,
	REL.FRIENDLY,
	REL.ALLY,
] as const

// Transition matrix: [from][to] probabilities
const TRANSITION_MATRIX: Record<Relation, number[] | undefined> = {
	[REL.NONE]: undefined,
	[REL.OVERLORD]: undefined,
	[REL.VASSAL]: undefined,
	[REL.PU_SENIOR]: undefined,
	[REL.PU_JUNIOR]: undefined,
	[REL.RIVAL]: [0.65, 0.25, 0.08, 0.02, 0.0],
	[REL.SUSPICIOUS]: [0.18, 0.5, 0.22, 0.05, 0.05],
	[REL.NEUTRAL]: [0.05, 0.18, 0.5, 0.15, 0.12],
	[REL.FRIENDLY]: [0.02, 0.1, 0.2, 0.45, 0.23],
	[REL.ALLY]: [0.01, 0.04, 0.1, 0.2, 0.65],
	[REL.WAR]: undefined,
}

function rollTransition(current: Relation, rng: HistoryRng): Relation {
	const row = TRANSITION_MATRIX[current]
	if (!row) return current
	let roll = rng.random()
	for (let i = 0; i < row.length; i++) {
		roll -= row[i]
		if (roll <= 0) return LADDER_STATES[i]
	}
	return LADDER_STATES[LADDER_STATES.length - 1]
}

function canBeRivals(state: HistoryState, a: number, b: number): boolean {
	const aW = wealthOptimal(state, a)
	const bW = wealthOptimal(state, b)
	const ratio = Math.min(aW, bW) / Math.max(aW, bW)
	return ratio >= 0.8
}

function canVassalize(
	state: HistoryState,
	a: number,
	b: number,
): { vassal: number; overlord: number } | null {
	const aW = wealthOptimal(state, a)
	const bW = wealthOptimal(state, b)
	const ratio = Math.min(aW, bW) / Math.max(aW, bW)
	if (ratio >= 0.5) return null
	return aW <= bW ? { vassal: a, overlord: b } : { vassal: b, overlord: a }
}

function syncVassalRelations(
	state: HistoryState,
	vassal: number,
	overlord: number,
): void {
	const vassalNeighbors = getNationNeighbors(state, vassal)
	for (const nb of vassalNeighbors) {
		if (nb === overlord) continue
		const vassalRel = getRelation(state, vassal, nb)
		if (
			vassalRel === REL.VASSAL ||
			vassalRel === REL.OVERLORD ||
			vassalRel === REL.PU_SENIOR ||
			vassalRel === REL.PU_JUNIOR
		)
			continue

		const overlordRel = getRelation(state, overlord, nb)
		if (
			overlordRel === REL.SUSPICIOUS ||
			overlordRel === REL.WAR ||
			overlordRel === REL.RIVAL
		) {
			setRelation(state, vassal, nb, REL.SUSPICIOUS)
		}
	}
}

function processVassalDiplomacy(
	state: HistoryState,
	vassal: number,
	overlord: number,
	rng: HistoryRng,
): void {
	syncVassalRelations(state, vassal, overlord)

	const threat = warThreat(state, overlord, vassal)
	if (threat <= 0.4) return

	// Break vassalage
	setRelation(state, vassal, overlord, REL.SUSPICIOUS)
	state.events.push({
		tag: "vassalage ended",
		time: state.time,
		data: { vassal, overlord },
	})

	// Probabilistic counter-war
	const counterWarChance = 0.7 * (1 - threat)
	if (rng.random() < counterWarChance) {
		startWar(state, overlord, vassal, rng)
	}
}

function processPersonalUnionDiplomacy(
	state: HistoryState,
	junior: number,
	senior: number,
	rng: HistoryRng,
): void {
	syncVassalRelations(state, junior, senior)

	const threat = warThreat(state, senior, junior)
	if (threat <= 0.4) return

	// Break union
	setRelation(state, junior, senior, REL.SUSPICIOUS)
	state.events.push({
		tag: "personal union ended",
		time: state.time,
		data: { junior, senior },
	})

	const counterWarChance = 0.7 * (1 - threat)
	if (rng.random() < counterWarChance) {
		startWar(state, senior, junior, rng)
	}
}

function nextEvent(
	state: HistoryState,
	province: number,
	rng: HistoryRng,
	years?: number,
): void {
	state.heap.enqueue(
		state.time + deltaYear(years ?? rng.uniform(8, 15)),
		EVT.DIPLOMACY,
		province,
		0,
		0,
		0,
		state.time,
	)
}

export function initDiplomacy(state: HistoryState, rng: HistoryRng): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		nextEvent(state, p, rng, rng.uniform(0, 8))
	}
}

export function runDiplomacy(
	state: HistoryState,
	nation: number,
	rng: HistoryRng,
): void {
	if (!isSovereign(state, nation)) {
		nextEvent(state, nation, rng)
		return
	}

	const neighbors = getNationNeighbors(state, nation)
	const neighborSet = new Set(neighbors)

	// Cleanup pass: drop non-neighbor relations to neutral
	for (let other = 0; other < state.P; other++) {
		if (other === nation || state.desolate[other]) continue
		const rel = getRelation(state, nation, other)
		if (rel === REL.NONE || rel === REL.NEUTRAL) continue
		if (
			rel === REL.VASSAL ||
			rel === REL.OVERLORD ||
			rel === REL.PU_SENIOR ||
			rel === REL.PU_JUNIOR
		)
			continue

		if (!neighborSet.has(other) || !isSovereign(state, other)) {
			setRelation(state, nation, other, REL.NEUTRAL)
		}
	}

	// Rival size-gate decay
	for (const nb of neighbors) {
		if (!isSovereign(state, nb)) continue
		const rel = getRelation(state, nation, nb)
		if (rel === REL.RIVAL && !canBeRivals(state, nation, nb)) {
			setRelation(state, nation, nb, REL.SUSPICIOUS)
		}
	}

	// Standard diplomacy transitions
	for (const nb of neighbors) {
		if (!isSovereign(state, nb)) continue
		const rel = getRelation(state, nation, nb)

		if (rel === REL.OVERLORD || rel === REL.PU_SENIOR) continue
		if (rel === REL.WAR) continue

		if (rel === REL.VASSAL) {
			processVassalDiplomacy(state, nation, nb, rng)
			continue
		}

		if (rel === REL.PU_JUNIOR) {
			processPersonalUnionDiplomacy(state, nation, nb, rng)
			continue
		}

		const next = rollTransition(rel, rng)
		if (next === rel) continue

		// Ally → vassalize if wealth ratio < 50%
		if (next === REL.ALLY) {
			const pair = canVassalize(state, nation, nb)
			if (pair) {
				// Subject relations are relation-only; do not infer them from territory.
				const existingOverlord = getRulerRelation(state, pair.vassal)
				if (!existingOverlord) {
					setRelation(state, pair.vassal, pair.overlord, REL.VASSAL)
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
		if (next === REL.RIVAL && !canBeRivals(state, nation, nb)) {
			if (rel !== REL.SUSPICIOUS) {
				setRelation(state, nation, nb, REL.SUSPICIOUS)
			}
			continue
		}

		setRelation(state, nation, nb, next)
	}

	nextEvent(state, nation, rng)
}
