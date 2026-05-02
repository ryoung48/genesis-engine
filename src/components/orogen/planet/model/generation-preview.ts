export interface GenerationPreviewParams {
	tidallyLocked: boolean
	obliquity: number
	eccentricity: number
	perihelion: number
	sunTempFactor: number
	hoursPerDay: number
	daysPerYear: number
	landCoverage: number
	planetRadiusKm: number
	pressure: number
}

export function buildGenerationPreviewConfig(params: GenerationPreviewParams) {
	return {
		obliquity: params.tidallyLocked ? 0 : params.obliquity,
		eccentricity: params.eccentricity,
		perihelion: params.perihelion,
		tSun: params.sunTempFactor * 5778,
		hoursPerDay: params.hoursPerDay,
		daysPerYear: params.daysPerYear,
		landFraction: params.landCoverage,
		radius: params.planetRadiusKm,
		pressure: params.pressure,
	}
}

export function getGenerationPreviewToggleLabel(showPreview: boolean) {
	return showPreview ? "Globe" : "Preview"
}

export function getGenerationPreviewCanvasClassName(
	showPreview: boolean,
	isMeasuring: boolean,
) {
	return `h-full w-full block ${isMeasuring ? "cursor-crosshair " : ""}${showPreview ? "invisible" : ""}`.trim()
}
