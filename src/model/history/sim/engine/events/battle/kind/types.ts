import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { Battlefield } from "@/model/history/sim/engine/terrain/types"
import type { SharedRng } from "@/model/shared/random/rng"
export type BattleKind = "open" | "ambush" | "river crossing" | "siege"
export type Ambusher = "attacker" | "defender" | "none"
export interface ChooseParams {
	state: HistoryState
	province: number
	siegeEligible: boolean
	rng: SharedRng
}
export interface ModifiersParams {
	kind: BattleKind
	terrain: Battlefield
	ambusher: Ambusher
}

export interface ChosenBattle {
	kind: BattleKind
	ambusher: Ambusher
}

export interface TownParams {
	state: HistoryState
	province: number
}
