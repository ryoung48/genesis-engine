export const GENERATION_PREVIEW_TABS = [
	["temperature", "TEMP"],
	["insolation", "INSOL"],
	["daylight", "LIGHT"],
] as const

export type GenerationPreviewTab = (typeof GENERATION_PREVIEW_TABS)[number][0]

interface GenerationPreviewParams {
	tidallyLocked: boolean
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

export function getGenerationPreviewToggleLabel(showPreview: boolean) {
	return showPreview ? "Globe" : "Preview"
}

export function getGenerationPreviewExitState() {
	return {
		showPreview: false,
		viewMode: "globe" as const,
	}
}

export function getGenerationPreviewCanvasClassName(
	showPreview: boolean,
	isMeasuring: boolean,
) {
	return `h-full w-full block ${isMeasuring ? "cursor-crosshair " : ""}${showPreview ? "invisible" : ""}`.trim()
}
