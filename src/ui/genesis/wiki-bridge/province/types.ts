import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
import type { HistoryTimeline } from "@/ui/genesis/view/types"
import type { ProvinceWikiData } from "@/ui/wiki/province/types"

export interface DescribeProvinceParams {
	world: SerializedGenesisWorld | null
	history: HistoryTimeline
	province: number | null
	planetName: string
	unitSystem: UnitSystem
	getProvinceName: (province: number) => string
	onBack: () => void
	onFocus: () => void
	onSelectNation: (id: number) => void
}

export interface ProvinceFrameIndexParams {
	world: SerializedGenesisWorld
	history: HistoryTimeline
	province: number
}

export type ProvinceDescription = ProvinceWikiData | null
