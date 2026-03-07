/**
 * BATTLE EVENT HANDLER
 *
 * Handles individual battles within an ongoing war.
 * Battles occur every 4-24 months until the war ends.
 *
 * War end conditions:
 * - Defender capital is captured → attacker wins (total victory), gains ALL defender provinces
 * - Defender reconquers all occupied provinces → defender wins
 * - Both sides fall below 10% optimal wealth → war ends in exhaustion (attacker keeps occupied)
 */

import { NATION } from "@/model/nations"
import { WAR } from "@/model/nations/wars"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { TIME } from "@/model/utilities/time"
import { BattleEvent, VictoryDegree } from "../types"

const EXHAUSTION_THRESHOLD = 0.25 // War ends if both below 25% optimal wealth

const exhausted = (nation: Province) => {
	const optimal = NATION.wealth.optimal(nation)
	return WAR.strength.solo({ nation }) < optimal * EXHAUSTION_THRESHOLD
}

/**
 * Determine victory degree based on how far the roll was from the threshold.
 * Margin is the absolute distance between roll and odds.
 *
 * For the winner (attackerWon = true means attacker won):
 *   - decisive: margin > 0.25 (won by a lot)
 *   - victory: margin 0.1-0.25 (solid win)
 *   - pyrrhic: margin < 0.1 (barely won, costly)
 *
 * For the loser:
 *   - crushing: margin > 0.25 (got destroyed)
 *   - defeat: margin 0.1-0.25 (clear loss)
 *   - close: margin < 0.1 (almost won)
 */
const getVictoryDegree = (margin: number, isWinner: boolean): VictoryDegree => {
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

/**
 * Cost multipliers based on victory degree.
 * Winners pay less for decisive victories, more for pyrrhic ones.
 * Losers pay more for crushing defeats, less for close ones.
 */
const COST_MULTIPLIERS: Record<VictoryDegree, number> = {
	decisive: 0.5, // Clean victory, minimal losses
	victory: 0.75, // Solid win
	pyrrhic: 1.25, // Won but at great cost
	close: 1.0, // Almost won, fought well
	defeat: 1.25, // Clear loss
	crushing: 1.5, // Routed, heavy casualties
}

const calculateCost = (params: {
	target: Province
	restoration: boolean
	attackerDegree: VictoryDegree
	defenderDegree: VictoryDegree
}) => {
	const baseCost = NATION.wealth.optimal(params.target) * 0.5
	const attackerCost = baseCost * COST_MULTIPLIERS[params.attackerDegree]
	const defenderCost = baseCost * COST_MULTIPLIERS[params.defenderDegree]

	return { attackerCost, defenderCost }
}

const distributeCosts = (
	leader: Province,
	allies: Province[],
	totalCost: number,
) => {
	PROVINCE.consumption.delta(leader, totalCost)
	const allyCost = totalCost * 0.4
	const allyStrengths = allies.map((ally) => {
		return { ally, str: WAR.strength.solo({ nation: ally }) }
	})
	const totalStr = allyStrengths.reduce((sum, a) => sum + a.str, 0)
	if (totalStr === 0) return
	for (const { ally, str } of allyStrengths) {
		PROVINCE.consumption.delta(ally, allyCost * (str / totalStr))
	}
}

export const BATTLE_EVENT = {
	run: (event: BattleEvent) => {
		const war = window.world.wars[event.war]
		if (war.endTime !== undefined) return

		const { attacker, defender } = WAR.participants({ war })

		if (
			!NATION.sovereign(attacker.leader) ||
			!NATION.sovereign(defender.leader)
		) {
			WAR.resolve({
				war,
				stalemate: "nations no longer sovereign",
			})
			return
		}

		const restoration = war.attacker === event.defender
		const target = restoration
			? BATTLE_EVENT.targets.reconquest(event)
			: BATTLE_EVENT.targets.invasion(event)

		if (!target) {
			WAR.resolve({
				war,
				stalemate: "no valid target found",
			})
			return
		}

		const odds = 1 - WAR.threat({
			attacker: attacker.leader,
			defender: defender.leader,
		})
		const outcome = window.dice.random < odds
		const margin = window.dice.uniform(0, 1)

		// Determine victory degree for both sides
		const attackerWon = outcome
		const attackerDegree = getVictoryDegree(margin, attackerWon)
		const defenderDegree = getVictoryDegree(margin, !attackerWon)

		const { attackerCost, defenderCost } = calculateCost({
			target,
			restoration,
			attackerDegree,
			defenderDegree,
		})

		// Distribute costs: leader pays 60%, allies split 40%
		distributeCosts(attacker.leader, attacker.allies, attackerCost)
		distributeCosts(defender.leader, defender.allies, defenderCost)

		if (outcome) {
			if (restoration) {
				PROVINCE.occupations.remove(target)
				war.occupied = war.occupied.filter((idx) => idx !== target.idx)
			} else {
				PROVINCE.occupations.add(target, war.idx)
				war.occupied.push(target.idx)
			}
		}

		// Log battle event with victory degree (from winner's perspective)
		const winnerDegree = attackerWon ? attackerDegree : defenderDegree
		window.world.past.push({
			tag: "battle",
			time: window.world.time,
			agents: [war.attacker, war.defender],
			war: war.idx,
			province: target.idx,
			attacker: event.attacker,
			defender: event.defender,
			winner: outcome ? event.attacker : event.defender,
			odds,
			margin,
			victoryDegree: winnerDegree,
			attackerCost,
			defenderCost,
		})

		const atkExhausted = exhausted(attacker.leader)
		const defExhausted = exhausted(defender.leader)

		if (outcome && restoration && war.occupied.length === 0) {
			WAR.resolve({
				war,
			})
		} else if (outcome && target.idx === war.defender) {
			WAR.resolve({
				war,
				victory: true,
			})
		} else if (atkExhausted && defExhausted) {
			WAR.resolve({
				war,
				stalemate: "both nations exhausted",
			})
		} else if (event.attacker === war.attacker && war.occupied.length === 0) {
			if (atkExhausted)
				WAR.resolve({
					war,
				})
			else
				BATTLE_EVENT.spawn({
					war: war.idx,
					attacker: war.attacker,
					defender: war.defender,
				})
		} else {
			BATTLE_EVENT.spawn({
				war: war.idx,
				attacker: outcome ? event.attacker : event.defender,
				defender: outcome ? event.defender : event.attacker,
			})
		}
	},
	spawn: (params: Omit<BattleEvent, "time" | "type">) => {
		window.world.future.enqueue({
			type: "battle",
			time: window.world.time + TIME.delta.month(window.dice.uniform(4, 24)),
			...params,
		})
	},
	targets: {
		invasion: (event: BattleEvent) => {
			const war = window.world.wars[event.war]
			const attacker = window.world.provinces[war.attacker]
			const defender = window.world.provinces[war.defender]
			const attackerTerritory = new Set([
				...NATION.provinces(attacker).map((p) => p.idx),
				...war.occupied,
			])
			return window.dice.shuffle(
				NATION.provinces(defender)
					.filter((p) => PROVINCE.occupations.get(p) === undefined) // Not already occupied
					.filter((p) => {
						// Must border attacker's territory or occupied provinces
						const neighbors = PROVINCE.neighbors({ province: p })
						return neighbors.some((n) => attackerTerritory.has(n.idx))
					}),
			)[0]
		},
		reconquest: (event: BattleEvent) => {
			const war = window.world.wars[event.war]
			const reconqueredIdx = war.occupied[war.occupied.length - 1]
			return window.world.provinces[reconqueredIdx]
		},
	},
}
