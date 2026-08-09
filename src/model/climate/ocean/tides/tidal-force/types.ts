export interface StarTidalPosition {
	latRad: number
	lonRad: number
	distanceM: number
}

export type TideContributionParams = {
	bodyLatRad: number
	bodyLonRad: number
	bodyDistanceM: number
	bodyMassKg: number
	surfaceLatRad: number
	surfaceLonRad: number
	planetMassKg: number
	planetRadiusM: number
}

export type MoonMoonTideContributionParams = {
	raisedMoonRadiusM: number
	raisedMoonMassKg: number
	raisingMoonMassKg: number
	separationM: number
}

export type StarTidalPositionParams = {
	orbitalDistanceAU: number
	planetEccentricity: number
	perihelionLonDeg: number
	t: number
	daysPerYear: number
}

export type StarTideContributionParams = {
	starLatRad: number
	starLonRad: number
	starDistanceM: number
	starMassKg: number
	surfaceLatRad: number
	surfaceLonRad: number
	planetMassKg: number
	planetRadiusM: number
}

export type ApparentDiameterRadParams = {
	bodyDiameterM: number
	distanceM: number
}
