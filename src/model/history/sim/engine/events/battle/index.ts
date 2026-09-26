import type {
	FindInvasionTargetParams,
	FindReconquestTargetParams,
	GetVictoryDegreeParams,
	RunBattleParams,
	VictoryDegree,
} from "@/model/history/sim/engine/events/battle/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"

function getVictoryDegree({
	lossRatio,
}: GetVictoryDegreeParams): VictoryDegree {
	if (lossRatio > 3) return "decisive"
	if (lossRatio > 1.5) return "victory"
	return "pyrrhic"
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
	JOURNAL.coalition({
		state,
		warId: war.idx,
		rebel: war.rebel,
		attackers: [
			war.attacker,
			...STATE.getWarAllies({
				state,
				nation: war.attacker,
				type: "offensive",
				target: war.defender,
			}),
		],
		defenders: [
			war.defender,
			...STATE.getWarAllies({
				state,
				nation: war.defender,
				type: "defensive",
				target: war.attacker,
			}),
		],
	})

	const result = MILITARY.fight({ state, war, eventAttacker, rng })
	const outcome = result.attackerWon
	const winnerShare = outcome
		? result.attackerLossShare
		: result.defenderLossShare
	const loserShare = outcome
		? result.defenderLossShare
		: result.attackerLossShare
	const victoryDegree = getVictoryDegree({
		lossRatio: loserShare / Math.max(1e-6, winnerShare),
	})

	const loot =
		outcome && !restoration
			? MILITARY.plunder({
					state,
					raider: eventAttacker,
					loser: eventDefender,
					province: target,
					sack: target === war.defender,
				})
			: 0

	if (outcome) {
		if (restoration) {
			FIELDS.prov.occupation.set({
				state,
				p: target,
				value: -1,
			})
			const i = war.occupied.indexOf(target)
			if (i >= 0) war.occupied.splice(i, 1)
		} else {
			FIELDS.prov.occupation.set({
				state,
				p: target,
				value: war.idx,
			})
			if (!war.occupied.includes(target)) war.occupied.push(target)
		}
	}

	state.events.push({
		tag: "battle",
		time: state.time,
		data: {
			war: war.idx,
			province: target,
			attacker: eventAttacker,
			defender: eventDefender,
			winner: outcome ? eventAttacker : eventDefender,
			odds: result.winChance,
			victoryDegree,
			attackerArmy: Math.round(result.attackerArmy),
			defenderArmy: Math.round(result.defenderArmy),
			attackerLosses: 100 * result.attackerLossShare,
			defenderLosses: 100 * result.defenderLossShare,
			plunder: loot,
		},
	})

	const atkExhausted = MILITARY.exhausted({ state, nation: war.attacker })
	const defExhausted = MILITARY.exhausted({ state, nation: war.defender })

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
