export interface HslToRgbParams {
	h: number
	s: number
	l: number
}

export interface GeneratePartitionColorsParams {
	count: number
	rng: { random(): number }
}

export interface RgbToHslParams {
	r: number
	g: number
	b: number
}

export type GraphPartitionParams = {
	nodeCount: number
	adjOffset: Int32Array
	adjList: Int32Array
	active: Uint8Array
	targetCount: number
	seed: number
}

export interface PartitionAdjacencyParams {
	count: number
	assignment: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
}
export interface PartitionAdjacency {
	adjOffset: Int32Array
	adjList: Int32Array
}
