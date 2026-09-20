import type { RefObject } from "react"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { ReligionMapMode } from "@/ui/genesis/shared/map-modes"

export interface HistoryTimelineInput {
	world: SerializedGenesisWorld | null
	religionMode: ReligionMapMode
	journalTransactionsRef: RefObject<JournalTransaction[]>
	journalVersion: number
}

export interface EarthTimelineInput {
	provinces: SerializedGenesisWorld["provinces"] | null | undefined
	isEarthImport: boolean
}
