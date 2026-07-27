import type { TideLock } from "@/model/celestial/orbit-body/types"
import type { GenesisParams } from "@/model/pipelines/types"
import type { SocietyEra } from "@/model/society/types"

export interface DecodedPlanetCode {
	seed: number
	numPoints: number
	landDistribution: number
	seaLevel: number
	continentSizeVariety: number
	landCoverage: number
	planetRadiusKm: number
	obliquity: number
	eccentricity: number
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	daysPerYear: number
	hoursPerDay: number
	tideLock: TideLock | null
	substellarLon: number
	perihelion: number
	pressure: number
	volcanism: number
	craters?: number
	maxElevation: number
	era: SocietyEra
	restSeed: number
}

export type FieldSpec = {
	name: string
	min: number
	step: number
	count: number
	read: (params: GenesisParams) => number
}

export interface ToIndexParams {
	value: number
	field: Pick<FieldSpec, "min" | "step" | "count">
}

export interface FromIndexParams {
	index: number
	field: Pick<FieldSpec, "min" | "step">
}

export interface EncodePlanetCodeParams {
	seed: number
	params: GenesisParams
}
