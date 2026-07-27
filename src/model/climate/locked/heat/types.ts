import type { SphereMesh } from "@/model/types/mesh"
import type { GenesisParams } from "@/model/types/tectonics"

export interface TidalTransportParams {
	T_mean_C: number
	A1: number
	A_night: number
	eccAmplitude: number
	LAPSE_RATE: number
	tidalTd: number
	redistribution: number
	contrast: number
}

export type MonthlyLibrationParams = {
	eccentricity: number
	perihelion: number
}

export type LockedDeclinationParams = {
	obliquity: number
	eccentricity: number
	perihelion: number
}

export type SubstellarDirectionParams = {
	substellarLon: number
	lonOffsetRad: number
	declinationRad: number
}

export type LockedMonthlyDaylightHoursParams = {
	mesh: SphereMesh
	params: Pick<
		GenesisParams,
		| "substellarLon"
		| "eccentricity"
		| "hoursPerDay"
		| "obliquity"
		| "perihelion"
	>
}

export type ComputeTidalTemperatureParams = {
	mesh: SphereMesh
	elevation: Float32Array
	landFraction: number[]
	params: GenesisParams
	oceanDist?: Float32Array
	elevation_km?: Float32Array
}
