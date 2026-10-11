import type {
	ClimateSubMode,
	TopographySubMode,
	VegetationSubMode,
} from "@/ui/genesis/controls/OverlayControls"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import type { ElevationSubMode } from "@/ui/genesis/shared/map-modes"

export interface ResolveSubModeParams {
	baseMode: ColorMode
	vegetationSubMode: VegetationSubMode
	climateSubMode: ClimateSubMode
	elevationSubMode: ElevationSubMode
	topographySubMode: TopographySubMode
}
