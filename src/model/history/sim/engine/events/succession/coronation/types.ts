import type { CoronationKind } from "@/model/history/sim/engine/events/succession/coronation/counters/types"
import type { Founding } from "@/model/history/sim/engine/state/titles/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { SharedRng } from "@/model/shared/random/rng"
import type { QualifiedFounding } from "@/model/society/dejure/founding/types"

export interface HoldCoronationParams {
	state: HistoryState
	realm: number
	rng: SharedRng
}

export interface HoldDeferredParams extends HoldCoronationParams {
	leader: number
}

export interface ElevateParams {
	state: HistoryState
	rng: SharedRng
}

export interface CrownParams {
	state: HistoryState
	realm: number
	kind: CoronationKind
	// The title elected to be founded at this coronation, if any.
	founding: Founding | null
}

export interface FlagCompositeParams {
	state: HistoryState
	qualifying: QualifiedFounding[]
}

export interface QualityParams {
	reference: number
	treasury: number
	safe: number
}

export interface ResolveParams {
	state: HistoryState
	realm: number
	rank: number
}
