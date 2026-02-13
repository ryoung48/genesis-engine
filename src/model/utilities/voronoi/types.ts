export type Vertex = [number, number]
export interface VoronoiParams {
	points: [number, number][]
	w: number
	h: number
}
export interface RelaxedVoronoiParams extends VoronoiParams {
	relaxation?: number
}

export type GeoVoronoiDiagram = {
	neighbors: number[][]
	polygons: number[][]
	centers: [number, number][]
	edges: [number, number][]
	find: (_x: number, _y: number) => number
	urquhart: (_distances: number[]) => boolean[]
}
