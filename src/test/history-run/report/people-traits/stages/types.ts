export type CharacterStage =
	| "draw"
	| "fertility"
	| "attributes"
	| "stress"
	| "personality"
export interface ConfigureStageParams {
	stage: CharacterStage
}
