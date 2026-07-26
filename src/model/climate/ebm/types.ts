import type { SharedRng } from "../../shared"

export interface IceAlbedoAtParams {
	temperatureK: number
	baseAlbedo: number
	iceAlbedo: number
	couplingFactor: number
}

export interface OrbitalParams {
	OBLIQUITY: number
	ECCENTRICITY: number
	PERIHELION: number
}

export interface StellarParams {
	T_SUN: number
	R_SUN: number
	AU: number
	SIGMA: number
}

export interface InsolationComputeParams {
	lats: number[]
	orbital: OrbitalParams
	stellarOverride?: StellarParams
}

export interface SolveTridiagonalParams {
	lower: readonly number[]
	diag: readonly number[]
	upper: readonly number[]
	rhs: readonly number[]
}

export interface RollGreenhouseFactorParams {
	rng: Pick<SharedRng, "randint">
	pressureBar: number
	atmosphereCode: number
}

export interface StepTemperatureParams {
	tIdx: number
	dt: number
	lower: readonly number[]
	diag: readonly number[]
	upper: readonly number[]
}

export interface RunModelParams {
	years: number
	dtDays: number
}
