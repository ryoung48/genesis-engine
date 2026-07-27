import type {
	ExhaustedParams,
	FindInvasionTargetParams,
	FindReconquestTargetParams,
	GetVictoryDegreeParams,
	RunBattleParams,
	VictoryDegree,
} from "@/model/history/events/battle/types"
import { FIELDS } from "@/model/history/fields"
import { STATE } from "@/model/history/state"

const EXHAUSTION_THRESHOLD = 0.25

function exhausted({ state, nation }: ExhaustedParams): boolean {
	const optimal = STATE.wealthOptimal({ state, p: nation })
	return (
		STATE.warStrengthSolo({ state, p: nation }) < optimal * EXHAUSTION_THRESHOLD
	)
}

function getVictoryDegree({
	margin,
	isWinner,
}: GetVictoryDegreeParams): VictoryDegree {
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

function findInvasionTarget({
	state,
	war,
	rng,
}: FindInvasionTargetParams): number | null {
	const attackerProvinces = STATE.getNationProvinces({
		state,
		root: war.attacker,
	})
	const attackerTerritory = new Set([...attackerProvinces, ...war.occupied])
	const defenderProvinces = STATE.getNationProvinces({
		state,
		root: war.defender,
	})

	const candidates = defenderProvinces.filter((p) => {
		if (state.occupationCurrent[p] === war.idx) return false
		const neighbors = STATE.getProvinceNeighbors({ state, p })
		return neighbors.some((nb) => attackerTerritory.has(nb))
	})

	if (candidates.length === 0) return null
	return rng.shuffle(candidates)[0]
}

function findReconquestTarget({
	war,
}: FindReconquestTargetParams): number | null {
	return war.occupied.length > 0 ? war.occupied[war.occupied.length - 1] : null
}

function runBattle({
	state,
	warIdx,
	eventAttacker,
	eventDefender,
	rng,
}: RunBattleParams): void {
	const war = state.wars[warIdx]
	if (war.endTime !== undefined) return

	if (
		!STATE.isSovereign({ state, p: war.attacker }) ||
		!STATE.isSovereign({ state, p: war.defender })
	) {
		STATE.resolveWar({
			state,
			war,
			rng,
			victory: false,
			stalemate: "nations no longer sovereign",
		})
		return
	}

	const restoration = war.attacker === eventDefender
	const target = restoration
		? findReconquestTarget({ war })
		: findInvasionTarget({ state, war, rng })

	if (target === null) {
		STATE.resolveWar({
			state,
			war,
			rng,
			victory: false,
			stalemate: "no valid target found",
		})
		return
	}

	const odds =
		1 -
		STATE.warThreat({ state, attacker: war.attacker, defender: war.defender })
	const outcome = rng.random() < odds
	const margin = rng.uniform(0, 1)

	const attackerWon = outcome
	const attackerDegree = getVictoryDegree({ margin, isWinner: attackerWon })
	const defenderDegree = getVictoryDegree({ margin, isWinner: !attackerWon })

	const baseCost = STATE.wealthOptimal({ state, p: target }) * 0.5
	const attackerCost = baseCost * COST_MULTIPLIERS[attackerDegree]
	const defenderCost = baseCost * COST_MULTIPLIERS[defenderDegree]

	// Distribute costs (simplified — no ally cost distribution for now)
	FIELDS.prov.consumption.delta({
		state,
		p: war.attacker,
		time: state.time,
		delta: attackerCost,
	})
	FIELDS.prov.consumption.delta({
		state,
		p: war.defender,
		time: state.time,
		delta: defenderCost,
	})

	if (outcome) {
		if (restoration) {
			FIELDS.prov.occupation.set({
				state,
				p: target,
				time: state.time,
				value: -1,
			})
			const i = war.occupied.indexOf(target)
			if (i >= 0) war.occupied.splice(i, 1)
		} else {
			FIELDS.prov.occupation.set({
				state,
				p: target,
				time: state.time,
				value: war.idx,
			})
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

	const atkExhausted = exhausted({ state, nation: war.attacker })
	const defExhausted = exhausted({ state, nation: war.defender })

	const occupiedCount = war.occupied.length

	if (outcome && restoration && occupiedCount === 0) {
		STATE.resolveWar({ state, war, rng })
	} else if (outcome && target === war.defender) {
		STATE.resolveWar({ state, war, rng, victory: true })
	} else if (atkExhausted && defExhausted) {
		STATE.resolveWar({
			state,
			war,
			rng,
			victory: false,
			stalemate: "both nations exhausted",
		})
	} else if (eventAttacker === war.attacker && occupiedCount === 0) {
		if (atkExhausted) {
			STATE.resolveWar({ state, war, rng })
		} else {
			STATE.queueBattleEvent({
				state,
				warIdx: war.idx,
				attacker: war.attacker,
				defender: war.defender,
				time: state.time + STATE.deltaMonth(rng.uniform(4, 24)),
			})
		}
	} else {
		STATE.queueBattleEvent({
			state,
			warIdx: war.idx,
			attacker: outcome ? eventAttacker : eventDefender,
			defender: outcome ? eventDefender : eventAttacker,
			time: state.time + STATE.deltaMonth(rng.uniform(4, 24)),
		})
	}
}

export const BATTLE = {
	runBattle,
}
