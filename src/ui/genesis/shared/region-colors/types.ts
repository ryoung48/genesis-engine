import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { DangerSubMode } from "@/ui/genesis/controls/OverlayControls"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { DepositsView } from "@/ui/genesis/shared/deposits-view/types"
import type {
	NationMapMode,
	SocietyMapMode,
} from "@/ui/genesis/shared/map-modes"

export interface RegionColorsInput {
	world: SerializedGenesisWorld
	colorMode: ColorMode
	nationMode: NationMapMode
	populationMode: SocietyMapMode
	temperatureMonth: number
	rainfallMonth: number
	dtrMonth: number
	currentMonth: number
	viewMode: "globe" | "map"
	dangerSubMode: DangerSubMode
	religionMode: "religions" | "types"
	depositsView: DepositsView
	year: number
}
