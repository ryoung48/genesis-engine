import type { RefObject } from "react"
import type { JournalTransaction } from "@/model/history/sim/engine/journal/types"
import type {
	GenesisWorkerResponse,
	SerializedGenesisWorld,
} from "@/model/worker-protocol/types"
import type { GenerationRequest } from "@/ui/genesis/generation/progress/types"
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

export interface GenerationCallbacks {
	setGenerating: (v: boolean) => void
	setGenerationProgress: (v: number | ((current: number) => number)) => void
	setGenerationLabel: (v: string) => void
	setSeed: (v: number) => void
	setWorld: (v: SerializedGenesisWorld | null) => void
	workerRef: React.MutableRefObject<Worker | null>
	onHistoryStart: (journal: JournalTransaction[]) => void
	onHistoryJournal: (journal: JournalTransaction[]) => void
	onGenerationComplete?: () => void
	onPathfindResult?: (result: {
		pathRegions: Int32Array
		distanceKm: number
		landKm: number
		seaKm: number
		travelDays: number
		reachable: boolean
	}) => void
}

export interface CreateWorkerParams {
	callbacks: GenerationCallbacks
	onDone: (message: Extract<GenesisWorkerResponse, { type: "done" }>) => void
	failLabel: string
	request: GenerationRequest
}
