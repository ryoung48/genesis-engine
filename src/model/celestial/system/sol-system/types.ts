import type { MoonBody, MoonOrbitRange } from "../../moons/types"
import type { AtmosphereProfile } from "../../orbit-body/types"
import type { SystemBody } from "../types"

export interface SolMoonSeed {
	name: string
	group: SystemBody["group"]
	classification: SystemBody["classification"]
	texturePath?: string
	diameterEarths: number
	massEarths: number
	gravityG: number
	densityEarthRelative: number
	densityDescription: string
	rotationHours: number
	tiltDeg: number
	eccentricity: number
	pd: number
	orbitRange: MoonOrbitRange
	atmosphere?: AtmosphereProfile
	landCoverage: number
	albedo: number
	greenhouseFactor: number
	inclinationDeg?: number
	longitudeOfPerihelionDeg?: number
	longitudeOfAscendingNodeDeg?: number
	meanAnomalyAtEpochDeg?: number
}

export interface SolPlanetSeed {
	name: string
	seed?: string
	group: SystemBody["group"]
	classification: SystemBody["classification"]
	texturePath?: string
	cloudsTexturePath?: string
	au: number
	diameterEarths: number
	massEarths: number
	gravityG: number
	densityEarthRelative: number
	densityDescription: string
	rotationHours: number
	tiltDeg: number
	eccentricity: number
	atmosphere?: AtmosphereProfile
	landCoverage: number
	landDistribution?: number
	continentSizeVariety?: number
	seaLevel?: number
	maxElevation?: number
	albedo: number
	greenhouseFactor: number
	moons?: SolMoonSeed[]
	tideLock?: SystemBody["tideLock"]
	substellarLon?: number
	inclinationDeg?: number
	longitudeOfPerihelionDeg?: number
	isMainWorld?: boolean
	rings?: SystemBody["rings"]
}

export interface BuildPlanetOptions {
	starMassSol?: number
	moonsOverride?: MoonBody[]
	textureOverride?: string
}
