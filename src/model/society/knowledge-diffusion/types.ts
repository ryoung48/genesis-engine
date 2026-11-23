export interface KnowledgeLevelParams {
	knowledge: number
}

export interface OwnAdvanceParams {
	knowledge: number
	heldKnowledge: number
	development: number
}

export interface KnowledgeGraph {
	count: number
	desolate: Uint8Array
	adjOffset: Int32Array
	adjList: Int32Array
	sovereign: Int32Array
	development: ArrayLike<number>
}

export interface DiffusionStepParams {
	graph: KnowledgeGraph
	current: Float32Array
	next: Float32Array
	yearFraction: number
	heldKnowledge: number
}

export interface PopulationMeanParams {
	values: ArrayLike<number>
	population: ArrayLike<number>
	include: Uint8Array
}

export interface SpinUpParams {
	graph: KnowledgeGraph
	values: Float32Array
	population: ArrayLike<number>
	held: Uint8Array
	baseline: number
}
