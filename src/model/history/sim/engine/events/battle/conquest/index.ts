import type {
	ApplyConquestParams,
	SettleParams,
} from "@/model/history/sim/engine/events/battle/conquest/types"
import type { NextBattleTimeParams } from "@/model/history/sim/engine/events/battle/types"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import { OVERTHROW } from "@/model/history/sim/engine/events/succession/overthrow"
import { WAR_SCORE } from "@/model/history/sim/engine/events/war/score"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import type { BattleOutcome } from "@/model/history/sim/engine/military/types"
import { STATE } from "@/model/history/sim/engine/state"

const WINNER_INITIATIVE = 0.7
const DEFENSIVE_SETTLEMENT_CHANCE: Partial<Record<BattleOutcome, number>> = {
	decisive: 0.4,
	rout: 0.75,
	uncontested: 0.9,
}

const NEXT_BATTLE_MONTHS: Record<BattleOutcome, [number, number]> = {
	inconclusive: [3, 8],
	normal: [2, 10],
	decisive: [1, 4],
	rout: [1, 4],
	uncontested: [1, 4],
	empty: [1, 4],
}

function nextBattleTime({ state, outcome, rng }: NextBattleTimeParams): number {
	const [lo, hi] = NEXT_BATTLE_MONTHS[outcome]
	return state.time + STATE.deltaMonth(rng.uniform(lo, hi))
}

function settle({ state, war, rng }: SettleParams): boolean {
	if (war.goal === "claim" && !OVERTHROW.stands({ state, war })) {
		PEACE.conclude({ state, war, rng, reason: "claim lapsed" })
		return true
	}
	const { score } = WAR_SCORE.current({ state, war })
	if (score >= WAR_SCORE.limit) {
		PEACE.conclude({ state, war, rng, reason: "enforced" })
		return true
	}
	if (score <= -WAR_SCORE.limit) {
		PEACE.conclude({ state, war, rng, reason: "defended" })
		return true
	}
	return false
}

function apply({
	state,
	war,
	attacker,
	defender,
	province: target,
	attackerWon,
	outcome,
	loserLossShare,
	sack,
	record,
	rng,
}: ApplyConquestParams): void {
	const restoration = war.attacker === defender
	const result = { attackerWon, outcome }
	const progress = result.attackerWon && result.outcome !== "inconclusive"

	const loot =
		progress && !restoration
			? MILITARY.plunder({
					state,
					raider: attacker,
					loser: defender,
					province: target,
					sack: sack || target === war.defender,
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
			const i = war.occupied.indexOf(target)
			if (i >= 0) war.occupied.splice(i, 1)
			war.occupied.push(target)
		}
	}

	const winner = result.attackerWon ? attacker : defender
	const loser = result.attackerWon ? defender : attacker
	if (result.outcome !== "inconclusive")
		WAR_SCORE.battle({ war, winner, loserLossShare })

	record(loot)

	const atkExhausted = MILITARY.exhausted({ state, nation: war.attacker })
	const defExhausted = MILITARY.exhausted({ state, nation: war.defender })
	const defensiveSettlementChance =
		DEFENSIVE_SETTLEMENT_CHANCE[result.outcome] ?? 0

	const time = nextBattleTime({ state, outcome: result.outcome, rng })

	if (settle({ state, war, rng })) return
	if (atkExhausted && defExhausted) {
		PEACE.conclude({ state, war, rng, reason: "both exhausted" })
	} else if (
		attacker === war.attacker &&
		STATE.occupiedLand({ state, war }).length === 0
	) {
		if (atkExhausted) {
			PEACE.conclude({ state, war, rng, reason: "offensive spent" })
		} else if (
			!result.attackerWon &&
			defensiveSettlementChance > 0 &&
			rng.random() < defensiveSettlementChance
		) {
			PEACE.conclude({ state, war, rng, reason: "offensive repelled" })
		} else {
			STATE.queueBattleEvent({
				state,
				warIdx: war.idx,
				attacker: war.attacker,
				time: result.attackerWon
					? time
					: nextBattleTime({ state, outcome: "inconclusive", rng }),
			})
		}
	} else if (PEACE.acceptBuyoff({ state, war, rng })) {
		PEACE.conclude({ state, war, rng, reason: "peace bought" })
	} else {
		const stalled = winner === war.defender
		if (
			(stalled || result.outcome !== "inconclusive") &&
			PEACE.negotiate({ state, war, rng, stalled })
		) {
			PEACE.conclude({ state, war, rng, reason: "negotiated" })
			return
		}
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
export const CONQUEST = { apply, settle }
