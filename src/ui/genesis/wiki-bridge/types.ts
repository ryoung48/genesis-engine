import type { WarRecord } from "@/model/history/record/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type { SceneRef } from "@/ui/genesis/view/types"

export interface RebelControlledNationIdsParams {
	frame: WorldFrame
	wars: WarRecord[]
}

export interface FocusWikiNationParams extends RebelControlledNationIdsParams {
	targetId: number
	sceneRef: SceneRef
}
