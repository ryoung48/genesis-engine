import type {
	Battle,
	HistoryRecord,
	WarRecord,
} from "@/model/history/record/types"
import type {
	PartitionRow,
	WorldFrame,
} from "@/model/history/world-frame/types"
import type { SceneRef } from "@/ui/genesis/view/types"

export interface BattleDetailParams {
	battle: Battle
	attackerName: string
	defenderName: string
}

export interface RebelControlledNationIdsParams {
	frame: WorldFrame
	wars: WarRecord[]
}

export interface FocusWikiNationParams extends RebelControlledNationIdsParams {
	targetId: number
	sceneRef: SceneRef
}

export interface RulerDisplayParams {
	record: HistoryRecord
	payload: Record<string, unknown>
}

export interface PartitionStatParams {
	label: string
	rows: PartitionRow[]
	assigned: number
	select: ((row: PartitionRow) => (() => void) | undefined) | null
}
