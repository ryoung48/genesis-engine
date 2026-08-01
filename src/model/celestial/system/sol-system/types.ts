import type { MoonBody, MoonOrbitRange } from "@/model/celestial/moons/types"
import type { AtmosphereProfile } from "@/model/celestial/orbit-body/types"
import type { SystemBody } from "@/model/celestial/system/types"

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
	/** [JUSTIFICATION] Procedurally generated and non-orbital display bodies
	 * retain their seeded fallback rather than carrying a physical node. */
	longitudeOfAscendingNodeDeg?: number
	longitudeOfPerihelionDeg?: number
	/** See OrbitBody.lsAphelionDeg's doc -- the EBM's actual seasonal-
	 * insolation input, distinct from longitudeOfPerihelionDeg above.
	 * Required (not optional, unlike longitudeOfPerihelionDeg) so every real
	 * Sol planet entry has to state its own real value explicitly rather than
	 * silently inherit the wrong quantity -- no fallback chain exists for
	 * this field. */
	lsAphelionDeg: number
	isMainWorld?: boolean
	rings?: SystemBody["rings"]
}

export interface BuildPlanetOptions {
	starMassSol?: number
	moonsOverride?: MoonBody[]
	textureOverride?: string
}
