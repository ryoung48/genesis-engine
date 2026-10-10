import type {
	ClimateSubMode,
	TopographySubMode,
	VegetationSubMode,
} from "@/ui/genesis/controls/OverlayControls"
import type { ColorMode } from "@/ui/genesis/shared/colors"

export interface ResolveSubModeParams {
	baseMode: ColorMode
	vegetationSubMode: VegetationSubMode
	climateSubMode: ClimateSubMode
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: TopographySubMode
}
