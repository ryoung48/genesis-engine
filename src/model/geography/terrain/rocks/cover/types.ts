export interface CoverFacies {
	carb: number
	salt: number
	organic: number
	marine: number
}

export interface CoverKindParams {
	facies: CoverFacies
	draw: number
}

export interface CoverShownParams {
	coverKm: number
	heightKm: number
	glaciated: boolean
}
