import type { ColorMode } from "../colors"
import type {
	ClimateSubMode,
	TopographySubMode,
	VegetationSubMode,
} from "./OverlayControls"

export interface ResolveSubModeParams {
	baseMode: ColorMode
	vegetationSubMode: VegetationSubMode
	climateSubMode: ClimateSubMode
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: TopographySubMode
}
