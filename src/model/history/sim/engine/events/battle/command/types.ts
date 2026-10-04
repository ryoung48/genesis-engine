import type { GovernorParams } from "@/model/history/sim/engine/governor/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

export interface CommandParams extends GovernorParams {}

// A ruler leading one battle in person.
export interface PersonalLeader {
	person: number
	// Multiplies their army's strength: below 1 only with Fragile Bones.
	penalty: number
}

export interface FatalityParams {
	state: HistoryState
	leader: PersonalLeader
	// Army sizes of the leader's side and of the enemy in this battle.
	own: number
	enemy: number
}
