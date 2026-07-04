export const GENERATION_PREVIEW_TABS = [
	["climate", "CLIMATE"],
	["insolation", "INSOL"],
	["daylight", "LIGHT"],
] as const

export type GenerationPreviewTab = (typeof GENERATION_PREVIEW_TABS)[number][0]

interface GenerationPreviewParams {
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	obliquity: number
	eccentricity: number
	perihelion: number
	antistellarLon: number
	spectralClass: string
	starSubtype: number
	orbitalDistanceAU: number
	hoursPerDay: number
	daysPerYear: number
	landCoverage: number
	planetRadiusKm: number
	pressure: number
}

export function buildGenerationPreviewConfig(params: GenerationPreviewParams) {
	return {
		obliquity: params.obliquity,
		eccentricity: params.eccentricity,
		perihelion: params.perihelion,
		antistellarLon: params.antistellarLon,
		spectralClass: params.spectralClass,
		starSubtype: params.starSubtype,
		orbitalDistanceAU: params.orbitalDistanceAU,
		hoursPerDay: params.hoursPerDay,
		daysPerYear: params.daysPerYear,
		landFraction: params.landCoverage,
		radius: params.planetRadiusKm,
		planetRadiusKm: params.planetRadiusKm,
		pressure: params.pressure,
	}
}
