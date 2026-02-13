export type WeightedDistribution<T> = { v: T; w: number }[]

export type DistributionParams<T> = {
	dist: WeightedDistribution<T>
	count: number
}
