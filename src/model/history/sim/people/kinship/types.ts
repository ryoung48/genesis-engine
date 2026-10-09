export interface KinshipContext {
	father: ArrayLike<number>
	mother: ArrayLike<number>
}
export interface KinshipParams {
	context: KinshipContext
	a: number
	b: number
}
export interface RelationParams extends KinshipParams {
	cache: Map<number, Map<number, number>> | null
}
export interface AncestorsParams {
	context: KinshipContext
	person: number
	cache: Map<number, Map<number, number>> | null
}
export interface KinshipRelation {
	kind: "close" | "uncleNiece" | "cousin" | "distant" | "none"
	relatedness: number
}
