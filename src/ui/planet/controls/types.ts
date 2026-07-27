import type { ColorMode } from "@/ui/planet/colors"
import type {
	ClimateSubMode,
	TopographySubMode,
	VegetationSubMode,
} from "@/ui/planet/controls/OverlayControls"

export interface ResolveSubModeParams {
	baseMode: ColorMode
	vegetationSubMode: VegetationSubMode
	climateSubMode: ClimateSubMode
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: TopographySubMode
}
