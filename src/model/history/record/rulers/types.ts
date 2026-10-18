import type {
	HistoryComment,
	HistoryRecord,
} from "@/model/history/record/types"
import type { LanguageNames } from "@/model/society/language/names"

export interface RulerRef {
	rulerId: number
	nameSeed: number
	// Province whose language names the ruler; a copied ruler keeps it.
	nameOrigin: number
	sex: number
	dynasty: number
	// Province whose language names the dynasty.
	dynastyOrigin: number
}

export type RulerRelation = "son" | "daughterLine" | "nearKin" | "kinsman"

export interface RulerKin {
	relation: RulerRelation
	late: RulerRef
}

export interface RulerNames {
	name: string
	house: string | null
	female: boolean
}

export interface NameContext {
	seed: number
	generator: LanguageNames
	cache: Map<number, RulerNames>
}

export interface InitializeNamesParams {
	record: HistoryRecord
	seed: number
	generator: LanguageNames
}

export interface RulerNamesParams {
	record: HistoryRecord
	ref: RulerRef
}

export interface RulerPayloadParams {
	record: HistoryRecord
	payload: Record<string, unknown>
}

export interface RulerCommentParams {
	record: HistoryRecord
	comment: HistoryComment
}
