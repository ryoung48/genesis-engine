export interface KinshipContext {
	father: ArrayLike<number>
	mother: ArrayLike<number>
}

export interface KinshipParams {
	context: KinshipContext
	a: number
	b: number
}

export interface ProhibitedMatchParams extends KinshipParams {
	cache: Map<number, Set<number>> | null
}
