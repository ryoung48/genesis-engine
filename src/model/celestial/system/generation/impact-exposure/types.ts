export interface ImpactExposureBeltInput {
	orbitalDistanceAU: number
	bulk: number
}

export interface ComputeImpactExposureForBodyInput {
	bodyOrbitalDistanceAU: number
	belts: ImpactExposureBeltInput[]
}
