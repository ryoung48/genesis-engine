import type { WarSide } from "@/model/history/sim/engine/military/deployments/types"
import type { Troops } from "@/model/history/sim/engine/military/recruitment/types"
import type { BattleOutcome } from "@/model/history/sim/engine/military/types"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export type Shortage = "supplies" | "food" | "water"
export type SiegeOutcome =
	| "surrendered"
	| "starved out"
	| "betrayed"
	| "stormed"
	| "relieved"
	| "lifted"
export type SiegeLiftReason =
	| "repelled"
	| "besiegers spent"
	| "invalid"
	| "war ended"
export interface Siege {
	province: number
	startTime: number
	phase: number
	besieger: number
	besiegerSide: WarSide
	startBesiegerStrength: number
	garrison: Record<number, Troops>
	startGarrison: number
	shortages: Shortage[]
	breaches: number
}
export type SiegeBeatData =
	| {
			beat:
				| "disease"
				| "supplies shortage"
				| "food shortage"
				| "water shortage"
				| "desertion"
				| "gates opened"
				| "surrender"
	  }
	| { beat: "breach"; breaches: number }
	| {
			beat: "sortie"
			won: boolean
			outcome: BattleOutcome
			powerShare: number
			effect: "breach repaired" | "works burned" | "none"
	  }
	| {
			beat: "assault"
			won: boolean
			outcome: BattleOutcome
			powerShare: number
			effect: "stormed" | "repelled" | "none"
	  }
	| {
			beat: "relief"
			won: boolean
			outcome: BattleOutcome
			powerShare: number
			effect: "relieved" | "none"
	  }
export interface SiegeParams {
	state: HistoryState
	war: War
	siege: Siege
}

export interface TickParams {
	state: HistoryState
	warIdx: number
	rng: SharedRng
}
export interface EndParams {
	state: HistoryState
	war: War
	outcome: SiegeOutcome
	reason: SiegeLiftReason | null
}
export interface FinishParams extends SiegeParams {
	outcome: SiegeOutcome
	reason: SiegeLiftReason | null
	rng: SharedRng
}

export interface LogBeatParams extends SiegeParams {
	beat: SiegeBeatData
	besiegerLosses: number
	garrisonLosses: number
}
