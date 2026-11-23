import type { GenesisViewMode } from "@/ui/genesis/renderer/types"

export type MapGridParams = {
	spacingDeg: number
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	gridVisible: boolean
	viewMode: GenesisViewMode
}
