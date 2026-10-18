import type {
	AnchorIndex,
	ChildInfo,
	PlacementStep,
	RulerFact,
} from "@/model/people/anchors/types"
import type { PersonKey } from "@/model/people/keys/types"

export interface StepParams {
	index: AnchorIndex
	late: RulerFact
	successor: RulerFact
}

export type Step = (params: StepParams) => boolean

export interface LadderStep {
	name: PlacementStep
	run: Step
}

export interface InfoParams {
	index: AnchorIndex
	key: PersonKey
}

export interface Proposal {
	key: PersonKey
	commit: () => void
}

export interface ProposeParams {
	index: AnchorIndex
	ruler: RulerFact
	timeMs: number
	sex: number | null
	ordinal: number
	side: number
}

export interface SideInfo {
	ruler: RulerFact | null
	nationId: number
}

export type { ChildInfo }
