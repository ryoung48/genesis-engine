import type {
	Disposition,
	HistoryState,
	War,
} from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"

export interface DispositionPairParams {
	state: HistoryState
	a: number
	b: number
}

export interface DispositionSetParams extends DispositionPairParams {
	value: Disposition
	cause: string
}

export interface SeedParams {
	rng: SharedRng
}

export interface RollParams extends SeedParams {
	current: Disposition
	// The two governors' mean opinion of each other, -1 to 1.
	bias: number
}

export interface WeightsParams {
	current: Disposition
	bias: number
}

export interface StepParams {
	current: Disposition
	steps: number
}

export interface DriftParams extends DispositionPairParams {
	rng: SharedRng
	bound: boolean
}

export interface AfterWarParams {
	state: HistoryState
	war: War
	outcome: string
}
