import { SiegeParams } from "@/model/history/sim/engine/events/siege/types"
import type { CoalitionMember } from "@/model/history/sim/engine/military/types"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"

export interface PrepareParams {
	state: HistoryState
	war: War
	attacker: number
	province: number
}

export interface LossParams extends SiegeParams {
	members: CoalitionMember[]
	losses: number
	garrison: boolean
}

export interface PartyParams {
	members: CoalitionMember[]
	share: number
}
