export interface TargetProfile {
	year: number
	ceiling: number
	shares: number[]
	means: number[]
}

export interface YearParams {
	year: number
}
export interface PmfParams {
	lo: number
	hi: number
	mean: number
	iterations: number
}
export interface PowerParams {
	lo: number
	hi: number
	alpha: number
}
export interface SizePmf {
	probabilities: number[]
	mean: number
	clamped: boolean
	mixture: boolean
	expansions: number
	numericalFallback: boolean
}
export interface ComponentProjection {
	capacity: number
	ceiling: number
	sizes: number[]
	shares: number[]
	territoryShares: number[]
	pmf: number[]
	continuousMean: number
	objective: number
	fitDiagnostics: PmfDiagnostic[]
}
export interface ProjectComponentParams {
	capacity: number
	profile: TargetProfile
}
export interface ProjectionParams {
	capacities: number[]
	year: number
}
export interface DistributionProjection {
	components: ComponentProjection[]
	targetN: number
	targetMean: number
	countryShares: number[]
	territoryShares: number[]
	distributionApplicable: boolean
	raw: TargetProfile
}
export interface Histogram {
	count: number
	mass: number
	countries: number[]
	territory: number[]
}
export interface HistogramParams {
	sizes: readonly number[]
}
export interface LossParams {
	observed: Histogram
	target: DistributionProjection
}
export interface GainParams {
	before: Histogram
	after: Histogram
	target: DistributionProjection
}
export interface ObjectiveParams {
	counts: number[]
	countries: number[]
	masses: number[]
	count: number
	capacity: number
	shares: number[]
	territoryShares: number[]
	pmf: number[]
}

export interface ActionParams {
	observed: Histogram
	remove: number[]
	add: number[]
}

export interface PmfDiagnostic {
	lo: number
	hi: number
	requestedMean: number
	mean: number
	clamped: boolean
	mixture: boolean
	expansions: number
	numericalFallback: boolean
}

export interface SizeParams {
	size: number
}
export interface EndpointParams {
	endpoint: number
}
