import type {
	BattleTarget,
	FindInvasionTargetParams,
	FindReconquestTargetParams,
	NextBattleTimeParams,
	ResolveTargetParams,
	RunBattleParams,
} from "@/model/history/sim/engine/events/battle/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import type { BattleOutcome } from "@/model/history/sim/engine/military/types"
import { STATE } from "@/model/history/sim/engine/state"
import { TERRAIN } from "@/model/history/sim/engine/terrain"

const WINNER_INITIATIVE = 0.7

const NEXT_BATTLE_MONTHS: Record<BattleOutcome, [number, number]> = {
	inconclusive: [3, 8],
	normal: [2, 10],
	decisive: [1, 4],
	rout: [1, 4],
	uncontested: [1, 4],
	empty: [1, 4],
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

function targetFor({
	state,
	war,
	attacker,
	rng,
}: ResolveTargetParams): number | null {
	return attacker === war.attacker
		? findInvasionTarget({ state, war, rng })
		: findReconquestTarget({ war })
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

function nextBattleTime({ state, outcome, rng }: NextBattleTimeParams): number {
	const [lo, hi] = NEXT_BATTLE_MONTHS[outcome]
	return state.time + STATE.deltaMonth(rng.uniform(lo, hi))
}

function runBattle({
	state,
	warIdx,
	eventAttacker,
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

	const battle = resolveTarget({ state, war, attacker: eventAttacker, rng })
	if (battle === null) {
		STATE.resolveWar({
			state,
			war,
			rng,
			victory: false,
			stalemate: "no valid target found",
		})
		return
	}
	const { attacker, defender, province: target } = battle
	const restoration = war.attacker === defender
	MILITARY.logCoalition({ state, war })

	const terrain = TERRAIN.battlefield({ state, p: target })
	const result = MILITARY.fight({
		state,
		war,
		eventAttacker: attacker,
		defense: terrain.defense,
		rng,
	})
	if (result.outcome === "empty") {
		STATE.resolveWar({
			state,
			war,
			rng,
			victory: false,
			stalemate: "no troops on either side",
		})
		return
	}
	const progress = result.attackerWon && result.outcome !== "inconclusive"

	const loot =
		progress && !restoration
			? MILITARY.plunder({
					state,
					raider: attacker,
					loser: defender,
					province: target,
					sack: target === war.defender,
				})
			: 0

	if (progress) {
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

	const winner = result.attackerWon ? attacker : defender
	const loser = result.attackerWon ? defender : attacker
	state.events.push({
		tag: "battle",
		time: state.time,
		data: {
			war: war.idx,
			province: target,
			attacker,
			defender,
			winner,
			result: result.outcome,
			initialResult: result.initialOutcome,
			preBattleWinProbability: result.preBattleWinProbability,
			powerShare: result.powerShare,
			topography: terrain.topography,
			vegetation: terrain.vegetation,
			waterTarget: terrain.water,
			terrainDefense: terrain.defense,
			loserShortfall: result.loserShortfall,
			attackerArmy: Math.round(result.attackerArmy),
			defenderArmy: Math.round(result.defenderArmy),
			attackerDeployed: Math.round(result.attackerDeployed),
			defenderDeployed: Math.round(result.defenderDeployed),
			deployedNations: result.deployments.map((member) => member.nation),
			deployedTroops: result.deployments.map((member) =>
				Math.round(member.force),
			),
			deployedRelations: result.relations,
			attackerLosses: 100 * result.attackerLossShare,
			defenderLosses: 100 * result.defenderLossShare,
			plunder: loot,
		},
	})

	const atkExhausted = MILITARY.exhausted({ state, nation: war.attacker })
	const defExhausted = MILITARY.exhausted({ state, nation: war.defender })

	const occupiedCount = war.occupied.length
	const time = nextBattleTime({ state, outcome: result.outcome, rng })

	if (progress && restoration && occupiedCount === 0) {
		STATE.resolveWar({ state, war, rng })
	} else if (progress && target === war.defender) {
		STATE.resolveWar({ state, war, rng, victory: true })
	} else if (atkExhausted && defExhausted) {
		STATE.resolveWar({
			state,
			war,
			rng,
			victory: false,
			stalemate: "both nations exhausted",
		})
	} else if (attacker === war.attacker && occupiedCount === 0) {
		if (atkExhausted) {
			STATE.resolveWar({ state, war, rng })
		} else {
			// A beaten offensive that holds nothing regroups before trying again.
			STATE.queueBattleEvent({
				state,
				warIdx: war.idx,
				attacker: war.attacker,
				time: result.attackerWon
					? time
					: nextBattleTime({ state, outcome: "inconclusive", rng }),
			})
		}
	} else {
		const next =
			result.outcome === "uncontested" || rng.random() < WINNER_INITIATIVE
				? winner
				: loser
		STATE.queueBattleEvent({
			state,
			warIdx: war.idx,
			attacker: next,
			time,
		})
	}
}

export const BATTLE = {
	runBattle,
}
