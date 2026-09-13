import type { SphereMesh } from "@/model/mesh/types"

export type WaterRainPlanet = {
	radiusKm: number
	surfacePressurePa: number
	freezingPointC: number
	monthDays: Float32Array
}

export type WaterRainParameters = {
	relativeHumidity: number
	exchangeCoefficient: number
	landRainoutLengthKm: number
	oceanRainoutLengthKm: number
	crosswindFraction: number
	coolingEfficiency: number
	orographicEfficiency: number
	orographicRiseKm: number
	convergenceEfficiency: number
	landfallFraction: number
	remainingMoistureTolerance: number
	maxTransportSteps: number
}

export type WaterRainForcing = {
	elevationKm: Float32Array
	permanentWater: Uint8Array
	airTemperatureMonthlyC: Float32Array
	seaSurfaceTemperatureMonthlyC: Float32Array
	windUMonthlyMs: Float32Array
	windVMonthlyMs: Float32Array
}

export type WaterRainInputs = {
	mesh: SphereMesh
	planet: WaterRainPlanet
	forcing: WaterRainForcing
	parameters: WaterRainParameters
}

export type WaterRainResult = {
	precipitationMonthlyMm: Float32Array
	rainMonthlyMm: Float32Array
	snowMonthlyMmWaterEquivalent: Float32Array
	evaporationMonthlyMm: Float32Array
	remainingMoistureMonthlyMm: Float32Array
	annualPrecipitationMm: Float32Array
	waterBudgetResidualFraction: Float64Array
	remainingMoistureFraction: Float64Array
	transportSteps: Uint16Array
}

export type EdgeGeometry = {
	from: Int32Array
	to: Int32Array
	lengthKm: Float32Array
	fromEast: Float32Array
	fromNorth: Float32Array
	toEast: Float32Array
	toNorth: Float32Array
}

export type SaturationVaporPressureParams = {
	temperatureC: number
	freezingPointC: number
}

export type SaturationWaterDensityParams = {
	temperatureC: number
	freezingPointC: number
}

export type EvaporationRateParams = {
	airTemperatureC: number
	seaSurfaceTemperatureC: number
	windSpeedMs: number
	permanentWater: boolean
	planet: WaterRainPlanet
	parameters: WaterRainParameters
}

export type RainoutParams = {
	source: number
	destination: number
	monthOffset: number
	edgeLengthKm: number
	convergence: Float32Array
	capacityMonthlyPa: Float32Array
	forcing: WaterRainForcing
	parameters: WaterRainParameters
}
