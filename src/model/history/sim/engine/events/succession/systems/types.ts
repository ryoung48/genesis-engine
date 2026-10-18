import type { RulerHouse } from "@/model/history/record/rulers/types"
import type { HeirPlan } from "@/model/history/sim/engine/state/rulers/heirs/types"
import type {
	AgeTable,
	Ruler,
} from "@/model/history/sim/engine/state/rulers/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SuccessionSystem } from "@/model/history/sim/nations/government/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface RealmParams {
	state: HistoryState
	realm: number
}

export interface ChooseParams {
	state: HistoryState
	realm: number
	// The late ruler's plan; null where no hereditary choice is read from it.
	plan: HeirPlan | null
	rng: SharedRng
}

export type SuccessionHouse = RulerHouse

export interface SuccessionChoice {
	system: SuccessionSystem
	// "same" keeps the late ruler's dynasty, "other" passes the crown through a
	// marriage, "new" founds a dynasty.
	house: SuccessionHouse
	claim: number
	age: AgeTable
	// The planned direct child who takes a single-heir throne.
	primary: Ruler | null
	// Planned younger siblings a partitioning realm divides among, oldest first.
	juniors: Ruler[]
	// The dynasty ends with no heir and the districts break away.
	interregnum: boolean
	// The crown passes to a daughter's line.
	daughterLine: boolean
}

export interface PretenderParams {
	state: HistoryState
	realm: number
	system: SuccessionSystem
	disputed: boolean
}

export interface PretenderOdds {
	// Chance that a district rises for a pretender; 0 when none can.
	chance: number
	// Chance that each other district joins it.
	supporters: number
}
