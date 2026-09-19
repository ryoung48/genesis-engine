export interface GroupByNationParams {
	assignment: Int32Array
	nationCount: number
	provinceCount: number
}

export interface ColorDistanceParams {
	a: [number, number, number]
	b: [number, number, number]
}

export interface NationColorsFromProvincesParams {
	nationCount: number
	seeds: number[]
	provinceColors: Float32Array
	adjOffset: Int32Array
	adjList: Int32Array
}

export interface NationColorForParams {
	baseColor: [number, number, number]
	neighborColors: [number, number, number][]
}
