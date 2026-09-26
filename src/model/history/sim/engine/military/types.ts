import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type WarSide = "attacker" | "defender"

export interface NationParams {
	state: HistoryState
	nation: number
}

export interface SideMembersParams extends NationParams {
	type: "offensive" | "defensive"
	target: number
}

export interface SquareShareParams {
	a: number
	b: number
}

export interface ThreatParams {
	state: HistoryState
	attacker: number
	defender: number
}

export interface RebellionThreatParams {
	state: HistoryState
	overlord: number
	subject: number
}

export interface CoalitionParams {
	state: HistoryState
	war: War
	side: WarSide
}

export interface CoalitionMember {
	nation: number
	force: number
}

export interface DeploymentAssignment {
	war: War
	opponent: number
	primary: boolean
}

export interface FightParams {
	state: HistoryState
	war: War
	eventAttacker: number
	rng: SharedRng
}

export interface BattleResult {
	attackerWon: boolean
	winChance: number
	attackerArmy: number
	defenderArmy: number
	attackerDeployed: number
	defenderDeployed: number
	attackerLossShare: number
	defenderLossShare: number
}

export interface ApplyLossesParams {
	state: HistoryState
	members: CoalitionMember[]
	losses: number
}

export interface LossShareParams {
	ratio: number
	multiplier: number
	rng: SharedRng
}

export interface PlunderParams {
	state: HistoryState
	raider: number
	loser: number
	province: number
	sack: boolean
}

export interface RaidParams {
	state: HistoryState
	raider: number
	victim: number
	province: number
	rng: SharedRng
}

export interface RaidResult {
	success: boolean
	loot: number
	raiderParty: number
	response: number
	raiderLosses: number
	victimLosses: number
}
