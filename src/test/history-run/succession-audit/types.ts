import type { HistoryState as RecordState } from "@/model/history/record/types"
import type { HistoryState as EngineState } from "@/model/history/sim/engine/state/types"
import type { PeopleState } from "@/model/history/sim/people/types"
import type {
	GenderLaw,
	SuccessionLaw,
} from "@/model/history/sim/succession-law/types"

export type KinBranch = "child" | "sibling" | "uncle" | "none"

export type AuditTally = Map<string, number>

export interface SuccessionSnapshot {
	province: number
	leaderIdx: number
	sovereign: boolean
	realm: number
	law: SuccessionLaw
	gender: GenderLaw
	time: number
	person: number
	nextDynasty: number
	liege: number
	held: number[]
	holders: Int32Array
	eventCount: number
	demesne: number
}

export interface BeforeSuccessionParams {
	state: EngineState
	province: number
	leaderIdx: number
}

export interface AfterSuccessionParams {
	state: EngineState
	snapshot: SuccessionSnapshot
	tally: AuditTally
}

export interface DivisionAuditParams extends AfterSuccessionParams {
	branch: ExpectedBranch
}

export interface FailParams {
	snapshot: SuccessionSnapshot
	message: string
}

export interface ExpectedBranchParams {
	people: PeopleState
	dying: number
	time: number
	gender: GenderLaw
}

export interface ExpectedBranch {
	kind: KinBranch
	line: Set<number>
}

export interface KinParams {
	people: PeopleState
	person: number
	time: number
	gender: GenderLaw
}

export interface LineParams {
	people: PeopleState
	person: number
}

export interface OrderParams {
	people: PeopleState
	persons: number[]
	gender: GenderLaw
}

export interface DemesneParams {
	state: EngineState
	holder: number
	realm: number
}

export interface BumpParams {
	tally: AuditTally
	key: string
}

export interface TitleChainParams {
	engine: EngineState
	record: RecordState
}

export interface RealmShareParams {
	state: EngineState
	snapshot: SuccessionSnapshot
}

export interface TitleShareParams extends RealmShareParams {
	title: number
}

export interface EqualTierParams extends RealmShareParams {
	tally: AuditTally
	juniors: number[]
}
