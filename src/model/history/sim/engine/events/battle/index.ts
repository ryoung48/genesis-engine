import { COMMAND } from "@/model/history/sim/engine/events/battle/command"
import { CONQUEST } from "@/model/history/sim/engine/events/battle/conquest"
import { BATTLE_KIND } from "@/model/history/sim/engine/events/battle/kind"
import type {
	BattleTarget,
	FindInvasionTargetParams,
	FindReconquestTargetParams,
	ResolveTargetParams,
	RunBattleParams,
} from "@/model/history/sim/engine/events/battle/types"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { TERRAIN } from "@/model/history/sim/engine/terrain"

function findInvasionTarget({
	state,
	war,
	rng,
}: FindInvasionTargetParams): number | null {
	const attackerProvinces = STATE.getNationProvinces({
		state,
		root: war.attacker,
	})
	const occupied = STATE.occupiedLand({ state, war })
	const covered = new Set(occupied)
	const attackerTerritory = new Set([...attackerProvinces, ...occupied])
	const defenderProvinces = STATE.getNationProvinces({
		state,
		root: war.defender,
	})

	const candidates = defenderProvinces.filter((p) => {
		if (covered.has(p)) return false
		const neighbors = STATE.getProvinceNeighbors({ state, p })
		return neighbors.some((nb) => attackerTerritory.has(nb))
	})

	if (candidates.length === 0) return null
	return rng.shuffle(candidates)[0]
}

// The defender goes for the seat: a child retaken under a held seat would stay
// covered through it.
function findReconquestTarget({
	state,
	war,
}: FindReconquestTargetParams): number | null {
	const covered = new Set(STATE.occupiedLand({ state, war }))
	return (
		war.occupied.findLast((p) => {
			if (state.occupationCurrent[p] !== war.idx || !covered.has(p))
				return false
			const parent = state.parentCurrent[p]
			return parent === war.defender || !covered.has(parent)
		}) ?? null
	)
}

function targetFor({
	state,
	war,
	attacker,
	rng,
}: ResolveTargetParams): number | null {
	return attacker === war.attacker
		? findInvasionTarget({ state, war, rng })
		: findReconquestTarget({ state, war })
}

// Occupation and sovereignty can change between queueing and fighting, so the
// queued attacker's target is found when the battle runs; if it has none, the
// other side takes the initiative.
function resolveTarget({
	state,
	war,
	attacker,
	rng,
}: ResolveTargetParams): BattleTarget | null {
	const defender = attacker === war.attacker ? war.defender : war.attacker
	const target = targetFor({ state, war, attacker, rng })
	if (target !== null) return { attacker, defender, province: target }
	const swapped = targetFor({ state, war, attacker: defender, rng })
	if (swapped === null) return null
	return { attacker: defender, defender: attacker, province: swapped }
}

function runBattle({
	state,
	warIdx,
	eventAttacker,
	rng,
}: RunBattleParams): void {
	const war = state.wars[warIdx]
	if (war.endTime !== undefined || war.siege !== null) return

	if (
		!STATE.isSovereign({ state, p: war.attacker }) ||
		!STATE.isSovereign({ state, p: war.defender })
	) {
		PEACE.conclude({ state, war, rng, reason: "not sovereign" })
		return
	}

	if (CONQUEST.settle({ state, war, rng })) return

	const battle = resolveTarget({ state, war, attacker: eventAttacker, rng })
	if (battle === null) {
		PEACE.conclude({ state, war, rng, reason: "no target" })
		return
	}
	const { attacker, defender, province: target } = battle
	MILITARY.logCoalition({ state })

	const siege = SIEGE.prepare({ state, war, attacker, province: target })
	const { kind, ambusher } = BATTLE_KIND.choose({
		state,
		province: target,
		siegeEligible: siege !== null,
		rng,
	})
	if (kind === "siege" && siege !== null) {
		SIEGE.begin({ state, war, siege })
		return
	}
	const terrain = TERRAIN.battlefield({ state, p: target })
	const modifiers = BATTLE_KIND.modifiers({ kind, ambusher, terrain })
	const attackerLeader = COMMAND.lead({ state, realm: attacker })
	const defenderLeader = COMMAND.lead({ state, realm: defender })
	const result = MILITARY.fight({
		state,
		war,
		eventAttacker: attacker,
		attackerMultiplier:
			modifiers.attackerMultiplier *
			COMMAND.multiplier({ state, realm: attacker }) *
			(attackerLeader?.penalty ?? 1),
		defenderMultiplier:
			modifiers.defenderMultiplier *
			COMMAND.multiplier({ state, realm: defender }) *
			(defenderLeader?.penalty ?? 1),
		rng,
	})
	if (result.outcome === "empty") {
		PEACE.conclude({ state, war, rng, reason: "no troops" })
		return
	}
	const attackerFell =
		attackerLeader !== null &&
		COMMAND.fatal({
			state,
			leader: attackerLeader,
			own: result.attackerArmy,
			enemy: result.defenderArmy,
		})
	const defenderFell =
		defenderLeader !== null &&
		COMMAND.fatal({
			state,
			leader: defenderLeader,
			own: result.defenderArmy,
			enemy: result.attackerArmy,
		})
	CONQUEST.apply({
		state,
		war,
		attacker,
		defender,
		province: target,
		attackerWon: result.attackerWon,
		outcome: result.outcome,
		loserLossShare: result.attackerWon
			? result.defenderLossShare
			: result.attackerLossShare,
		sack: false,
		rng,
		record: (loot) => {
			state.events.push({
				tag: "battle",
				time: state.time,
				data: {
					war: war.idx,
					kind,
					ambusher,
					province: target,
					attacker,
					defender,
					attackerLeader: attackerLeader?.person ?? -1,
					defenderLeader: defenderLeader?.person ?? -1,
					attackerLeaderKilled: attackerFell,
					defenderLeaderKilled: defenderFell,
					winner: result.attackerWon ? attacker : defender,
					result: result.outcome,
					initialResult: result.initialOutcome,
					preBattleWinProbability: result.preBattleWinProbability,
					powerShare: result.powerShare,
					topography: terrain.topography,
					vegetation: terrain.vegetation,
					waterTarget: terrain.water,
					terrainDefense: terrain.defense,
					martialDifference:
						GOVERNOR.attribute({
							state,
							realm: attacker,
							attribute: "martial",
						}) -
						GOVERNOR.attribute({
							state,
							realm: defender,
							attribute: "martial",
						}),
					loserShortfall: result.loserShortfall,
					attackerArmy: Math.round(result.attackerArmy),
					defenderArmy: Math.round(result.defenderArmy),
					attackerDeployed: Math.round(result.attackerDeployed),
					defenderDeployed: Math.round(result.defenderDeployed),
					...MILITARY.deploymentData({
						state,
						war,
						attackerSide: attacker === war.attacker ? "attacker" : "defender",
					}),
					attackerLosses: 100 * result.attackerLossShare,
					defenderLosses: 100 * result.defenderLossShare,
					plunder: loot,
				},
			})
		},
	})
	// A leader killed in the battle dies once it is settled; their succession
	// follows at once.
	for (const [leader, fell] of [
		[attackerLeader, attackerFell],
		[defenderLeader, defenderFell],
	] as const)
		if (leader && fell)
			PERSON_DEATH.kill({ state, person: leader.person, cause: "battle", rng })
}

export const BATTLE = {
	runBattle: (params: RunBattleParams) =>
		MILITARY.mutate({ state: params.state, action: () => runBattle(params) }),
}
