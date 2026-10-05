import type { PeopleRecord } from "@/model/history/record/people/types"
import type {
	Battle,
	HistoryRecord,
	WarRecord,
} from "@/model/history/record/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type { SceneRef } from "@/ui/genesis/view/types"

export interface BattleDetailParams {
	battle: Battle
	attackerName: string
	defenderName: string
}

export interface RecordPersonMentionParams {
	people: PeopleRecord | null
	person: number
}

export interface NoblePopularityParams {
	people: PeopleRecord
	record: HistoryRecord
	// The realm's capital province.
	seat: number
	timeMs: number
}

export interface RegentRoleParams {
	people: PeopleRecord | null
	regent: number
	ward: number
	// Regent kind from the engine: parent, relative or protector.
	kind: string
}

export interface RebelControlledNationIdsParams {
	frame: WorldFrame
	wars: WarRecord[]
}

export interface FocusWikiNationParams extends RebelControlledNationIdsParams {
	targetId: number
	sceneRef: SceneRef
}

export interface PersonDisplayParams {
	people: PeopleRecord | null
	payload: Record<string, unknown>
}
