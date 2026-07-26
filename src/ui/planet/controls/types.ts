export interface ResolveSubModeParams {
	baseMode: ColorMode
	vegetationSubMode: VegetationSubMode
	climateSubMode: ClimateSubMode
	elevationSubMode: "colored" | "grayscale"
	topographySubMode: TopographySubMode
}
