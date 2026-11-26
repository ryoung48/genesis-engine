export interface ClimateTestsParams {
	numRegions: number
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
	isLand: Uint8Array
}

export interface ClimateTests {
	bauxite: Float32Array
	ironLaterite: Float32Array
	evaporite: Float32Array
	peat: Float32Array
	enrichedCopper: Float32Array
	arid: Float32Array
}
