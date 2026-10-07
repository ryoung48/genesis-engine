import { ECONOMY } from "@/model/history/sim/engine/economy"
import type {
	BattleScoreParams,
	WarScore,
	WarScoreParams,
} from "@/model/history/sim/engine/events/war/score/types"
import { STATE } from "@/model/history/sim/engine/state"
import { MATH } from "@/model/shared/math/core"

const SCORE_LIMIT = 100
const BATTLE_SCALE = 50
const ATTACKER_BATTLE_CAP = 50
const DEFENDER_BATTLE_CAP = 100
const LAND_WEIGHT = 50
const CAPITAL_BONUS = 50

function battle({ war, winner, loserLossShare }: BattleScoreParams): void {
	const gain = BATTLE_SCALE * loserLossShare
	war.battleScore = MATH.clamp({
		value: war.battleScore + (winner === war.attacker ? gain : -gain),
		lo: -DEFENDER_BATTLE_CAP,
		hi: ATTACKER_BATTLE_CAP,
	})
}

function current({ state, war }: WarScoreParams): WarScore {
	const battles = war.battleScore
	const occupied = new Set(STATE.occupiedLand({ state, war }))
	if (occupied.size === 0)
		return { battles, land: 0, capital: 0, score: battles }
	const provinces = STATE.getNationProvinces({ state, root: war.defender })
	let total = 0
	let held = 0
	for (const p of provinces) {
		if (p === war.defender) continue
		const output = ECONOMY.provinceOutput({ state, p })
		total += output
		if (occupied.has(p)) held += output
	}
	const land = total > 0 ? (LAND_WEIGHT * held) / total : 0
	const capital = occupied.has(war.defender) ? CAPITAL_BONUS : 0
	return {
		battles,
		land,
		capital,
		score:
			occupied.size === provinces.length
				? SCORE_LIMIT
				: MATH.clamp({
						value: battles + land + capital,
						lo: -SCORE_LIMIT,
						hi: SCORE_LIMIT,
					}),
	}
}

export const WAR_SCORE = { battle, current, limit: SCORE_LIMIT }
