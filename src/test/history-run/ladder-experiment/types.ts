export interface LadderRules {
	higherTierParent: "active" | "none"
	lowerTierParent: "carrier" | "reducedCarrier" | "none"
	sideOrder: "goodFirst" | "independent"
}
export interface LadderGrade {
	active: number
	good: number
	bad: number
}
export interface LadderExperimentParams {
	seed: number
	channel: number
	first: LadderGrade
	second: LadderGrade
	birth: readonly number[]
	rules: LadderRules
}
export interface LadderGeneration {
	generation: number
	ladders: Record<string, { active: number[]; good: number[]; bad: number[] }>
}
export interface LadderSimulationParams {
	rules: LadderRules
}
