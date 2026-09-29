import type {
	GetWarAlliesParams,
	HistoryState,
	War,
} from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type WarSide = "attacker" | "defender"

export interface NationParams {
	state: HistoryState
	nation: number
}

export interface CostPerManYearParams extends NationParams {
	grams: number
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

export interface CoalitionParams {
	state: HistoryState
	war: War
	side: WarSide
}

export interface CoalitionMember {
	nation: number
	force: number
}

export interface Coalition {
	members: CoalitionMember[]
	// Share of the coalition's assigned troops still missing from its deployment.
	shortfall: number
}

export interface MemberDeploymentsParams {
	war: War
	members: CoalitionMember[]
}

export interface DeploymentAssignment {
	war: War
	opponent: number
}

export interface FightParams {
	state: HistoryState
	war: War
	eventAttacker: number
	defense: number
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

export interface WarAlliesParams extends GetWarAlliesParams {
	// Null when estimating a war that has not started.
	war: War | null
}

export interface LogCoalitionParams {
	state: HistoryState
	war: War
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
