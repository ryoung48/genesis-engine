export interface TechLevelParams {
	techLevel: number
}

export interface KardashevParams {
	watts: number
}

export interface SizePlan {
	percentages: number[]
	buckets: [number, number][]
}

export interface RealmLevelsParams {
	sovereign: Int32Array
	population: Float32Array
	techLevel: Float32Array
}

export interface WorldPowerParams {
	population: Float32Array
	techLevel: Float32Array
}

export interface WorldPower {
	watts: number
	kardashev: number
}

export interface LogLinearParams {
	domain: number[]
	range: number[]
	x: number
}
