/**
 * BATTLE EVENT — individual battles within an ongoing war.
 * Port of src/model/history/events/battle.ts
 */

import { EVT } from "../event-heap"
import { PROV } from "../fields"
import type { HistoryRng } from "../history-rng"
import {
	deltaMonth,
	getNationProvinces,
	getProvinceNeighbors,
	type HistoryState,
	isSovereign,
	resolveWar,
	type War,
	warStrengthSolo,
	warThreat,
	wealthOptimal,
} from "../state"

type VictoryDegree =
	| "decisive"
	| "victory"
	| "pyrrhic"
	| "close"
	| "defeat"
	| "crushing"

const EXHAUSTION_THRESHOLD = 0.25

function exhausted(state: HistoryState, nation: number): boolean {
	const optimal = wealthOptimal(state, nation)
	return warStrengthSolo(state, nation) < optimal * EXHAUSTION_THRESHOLD
}

function getVictoryDegree(margin: number, isWinner: boolean): VictoryDegree {
	if (isWinner) {
		if (margin > 0.66) return "decisive"
		if (margin > 0.33) return "victory"
		return "pyrrhic"
	} else {
		if (margin > 0.66) return "crushing"
		if (margin > 0.33) return "defeat"
		return "close"
	}
}

const COST_MULTIPLIERS: Record<VictoryDegree, number> = {
	decisive: 0.5,
	victory: 0.75,
	pyrrhic: 1.25,
	close: 1.0,
	defeat: 1.25,
	crushing: 1.5,
}

function findInvasionTarget(
	state: HistoryState,
	war: War,
	rng: HistoryRng,
): number | null {
	const attackerProvinces = getNationProvinces(state, war.attacker)
	const attackerTerritory = new Set([...attackerProvinces, ...war.occupied])
	const defenderProvinces = getNationProvinces(state, war.defender)

	const candidates = defenderProvinces.filter((p) => {
		if (state.occupationCurrent[p] === war.idx) return false
		const neighbors = getProvinceNeighbors(state, p)
		return neighbors.some((nb) => attackerTerritory.has(nb))
	})

	if (candidates.length === 0) return null
	return rng.shuffle(candidates)[0]
}

function findReconquestTarget(_state: HistoryState, war: War): number | null {
	return war.occupied.length > 0 ? war.occupied[war.occupied.length - 1] : null
}

function spawnBattle(
	state: HistoryState,
	warIdx: number,
	attacker: number,
	defender: number,
	rng: HistoryRng,
): void {
	state.heap.enqueue(
		state.time + deltaMonth(rng.uniform(4, 24)),
		EVT.BATTLE,
		warIdx,
		attacker,
		defender,
	)
}

export function runBattle(
	state: HistoryState,
	warIdx: number,
	eventAttacker: number,
	eventDefender: number,
	rng: HistoryRng,
): void {
	const war = state.wars[warIdx]
	if (war.endTime !== undefined) return

	if (!isSovereign(state, war.attacker) || !isSovereign(state, war.defender)) {
		resolveWar(state, war, rng, false, "nations no longer sovereign")
		return
	}

	const restoration = war.attacker === eventDefender
	const target = restoration
		? findReconquestTarget(state, war)
		: findInvasionTarget(state, war, rng)

	if (target === null) {
		resolveWar(state, war, rng, false, "no valid target found")
		return
	}

	const odds = 1 - warThreat(state, war.attacker, war.defender)
	const outcome = rng.random() < odds
	const margin = rng.uniform(0, 1)

	const attackerWon = outcome
	const attackerDegree = getVictoryDegree(margin, attackerWon)
	const defenderDegree = getVictoryDegree(margin, !attackerWon)

	const baseCost = wealthOptimal(state, target) * 0.5
	const attackerCost = baseCost * COST_MULTIPLIERS[attackerDegree]
	const defenderCost = baseCost * COST_MULTIPLIERS[defenderDegree]

	// Distribute costs (simplified — no ally cost distribution for now)
	PROV.consumption.delta(state, war.attacker, state.time, attackerCost)
	PROV.consumption.delta(state, war.defender, state.time, defenderCost)

	if (outcome) {
		if (restoration) {
			PROV.occupation.set(state, target, state.time, -1)
			const i = war.occupied.indexOf(target)
			if (i >= 0) war.occupied.splice(i, 1)
		} else {
			PROV.occupation.set(state, target, state.time, war.idx)
			if (!war.occupied.includes(target)) war.occupied.push(target)
		}
	}

	const winnerDegree = attackerWon ? attackerDegree : defenderDegree
	state.events.push({
		tag: "battle",
		time: state.time,
		data: {
			war: war.idx,
			province: target,
			attacker: eventAttacker,
			defender: eventDefender,
			winner: outcome ? eventAttacker : eventDefender,
			odds,
			margin,
			victoryDegree: winnerDegree,
			attackerCost,
			defenderCost,
		},
	})

	const atkExhausted = exhausted(state, war.attacker)
	const defExhausted = exhausted(state, war.defender)

	const occupiedCount = war.occupied.length

	if (outcome && restoration && occupiedCount === 0) {
		resolveWar(state, war, rng)
	} else if (outcome && target === war.defender) {
		resolveWar(state, war, rng, true)
	} else if (atkExhausted && defExhausted) {
		resolveWar(state, war, rng, false, "both nations exhausted")
	} else if (eventAttacker === war.attacker && occupiedCount === 0) {
		if (atkExhausted) {
			resolveWar(state, war, rng)
		} else {
			spawnBattle(state, war.idx, war.attacker, war.defender, rng)
		}
	} else {
		spawnBattle(
			state,
			war.idx,
			outcome ? eventAttacker : eventDefender,
			outcome ? eventDefender : eventAttacker,
			rng,
		)
	}
}
