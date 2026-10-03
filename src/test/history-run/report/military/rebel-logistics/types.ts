import type {
	RecruitmentLimits,
	Troops,
} from "@/model/history/sim/engine/military/recruitment/types"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"

export type ObservationSource =
	| "initial"
	| "mobilization"
	| "refresh"
	| "allocation"
	| "annual"
	| "battle"

export interface RebelLogisticsObservation {
	time: number
	war: number
	goal: "independence" | "throne"
	nation: number
	role: "crown" | "rebel" | "backer"
	source: ObservationSource
	population: number
	knowledge: number
	surplus: number
	uncappedTargets: Troops
	targets: Troops
	enrolled: Troops
	deployed: Troops
	logistics: number
	targetLimited: boolean
	limits: RecruitmentLimits
	enrollmentAtCap: boolean
	fieldLimit: number
	coalitionDeployed: number
	fieldLimited: boolean
}

export interface AttachParams {
	engine: HistoryState
}
export interface ObserveParams extends AttachParams {
	war: War
	nation: number
	source: ObservationSource
}
export interface SampleParams {
	source: ObservationSource
}
export interface AttachedDiagnostics {
	observations: RebelLogisticsObservation[]
	sample: (params: SampleParams) => void
	detach: () => void
}
