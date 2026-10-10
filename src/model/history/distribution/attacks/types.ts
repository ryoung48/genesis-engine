import type {
	DistributionProjection,
	Histogram,
} from "@/model/history/distribution/targets/types"
import type { Territory } from "@/model/history/distribution/territory/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface Attack {
	id: number
	attacker: number
	defender: number
	start: number
}
export interface AttackState {
	active: Map<number, Attack>
	nextId: number
	declared: Attack[]
	ended: Attack[]
	biases: number[]
	gains: number[]
	blocked: number
	attackerRatios: number[]
	opportunities: number
	suppressed: number
	resolved: number
	captureDraws: number
	completionRatios: number[]
	rejectedFronts: number
	rejectedCapacity: number
	endReasons: Record<AttackEndReason, number>
}
export interface AnnualAttackParams {
	attacks: AttackState
	territory: Territory
	target: DistributionProjection
	year: number
	rng: SharedRng
}
export interface OpportunityParams {
	attackerSize: number
	defenderSize: number
	gain: number
}
export interface WeightParams extends OpportunityParams {
	border: number
}
export interface CaptureParams {
	attackStrength: number
	defenseStrength: number
}
export interface EndAttackParams {
	attacks: AttackState
	territory: Territory
	attack: Attack
	year: number
	reason: AttackEndReason
}
export interface CeilingParams {
	territory: Territory
	countryId: number
	target: DistributionProjection
}
export interface MergerGainParams {
	observed: Histogram
	territory: Territory
	attacker: number
	defender: number
	target: DistributionProjection
}

export interface BiasParams {
	gain: number
}

export type AttackEndReason =
	| "absorbed"
	| "separated"
	| "timeout"
	| "blocked"
	| "ceiling"
	| "fragmentation"
export interface CompletionParams {
	attackerSize: number
	defenderSize: number
	attackerFronts: number
	defenderFronts: number
}
export interface FrontierParams {
	territory: Territory
	attacker: number
	defender: number
	limit: number
	firstOnly: boolean
}
