import type { WarSide } from "@/model/history/sim/engine/military/deployments/types"
import type {
	RecruitmentTargets,
	Troops,
} from "@/model/history/sim/engine/military/recruitment/types"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface NationParams {
	state: HistoryState
	nation: number
}

export interface SideMembersParams extends NationParams {
	type: "offensive" | "defensive"
	target: number
}

export interface ForceShareParams {
	a: number
	b: number
	k: number
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

export interface RebellionPreview {
	crown: RecruitmentTargets
	rebel: RecruitmentTargets
	league: Troops
	existingWars: number
	crownStrength: number
	rebelStrength: number
	threat: number
}

export interface CoalitionParams {
	state: HistoryState
	war: War
	side: WarSide
	excluded: Record<number, Troops>
}

export interface CoalitionMember {
	levy: number
	regular: number
	nation: number
	force: number
}

export interface Coalition {
	members: CoalitionMember[]
	// Missing share of the allocated participation-episode reference strength.
	shortfall: number
}

export interface MemberDeploymentsParams {
	war: War
	members: CoalitionMember[]
}

export interface FightParams {
	state: HistoryState
	war: War
	eventAttacker: number
	attackerMultiplier: number
	defenderMultiplier: number
	rng: SharedRng
}

export type BattleOutcome =
	| "inconclusive"
	| "normal"
	| "decisive"
	| "rout"
	| "uncontested"
	| "empty"

export interface RecordArmiesParams {
	state: HistoryState
}

export interface LeadRelationsParams {
	state: HistoryState
	coalitions: Coalition[]
}

export interface MemberRolesParams {
	war: War
	coalitions: Coalition[]
}

export interface DeploymentsOfParams {
	state: HistoryState
	war: War
	attackers: Coalition
	defenders: Coalition
}

export interface BattleDeployments {
	attackerDeployed: number
	defenderDeployed: number
	// Each coalition member's deployed troops after the battle.
	deployments: CoalitionMember[]
	// Each member's relation from its coalition's lead, -1 for the lead.
	relations: number[]
	roles: ("backer" | null)[]
}

export interface MobilizeParams {
	state: HistoryState
	war: War
}

export interface BattleResult extends BattleDeployments {
	outcome: BattleOutcome
	initialOutcome: BattleOutcome
	attackerWon: boolean
	preBattleWinProbability: number
	powerShare: number
	attackerArmy: number
	defenderArmy: number
	attackerLossShare: number
	defenderLossShare: number
	loserShortfall: number
}

export interface ApplyLossesParams {
	war: War | null
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

export interface MutationParams<T> {
	state: HistoryState
	action: () => T
}

export interface ProvinceMutationParams {
	state: HistoryState
	p: number
}

export interface CasualtiesParams {
	members: CoalitionMember[]
	losses: number
}
export interface ApplyTroopLossesParams {
	state: HistoryState
	war: War | null
	losses: Record<number, Troops>
}
export interface DeploymentDataParams {
	state: HistoryState
	war: War
	attackerSide: WarSide
}
export interface ClashParams {
	attackers: CoalitionMember[]
	defenders: CoalitionMember[]
	attackerShortfall: number
	defenderShortfall: number
	attackerMultiplier: number
	defenderMultiplier: number
	rng: SharedRng
}
export interface ClashResult {
	attackerWon: boolean
	outcome: BattleOutcome
	initialOutcome: BattleOutcome
	powerShare: number
	preBattleWinProbability: number
	attackerLosses: number
	defenderLosses: number
	loserShortfall: number
}
