export interface TidalEvent {
	dayOfYear: number
	tidalForce: number
	moonForces: number[]
	starForce: number
	moonPhases: number[]
	eclipseType: EclipseType
	moonMoonForces: number[]
	moonMoonSeparationsKm: number[]
}

export interface TidalSchedule {
	events: TidalEvent[]
	maxForce: number
	minForce: number
	moonsClamped: boolean
	contributorLabels: string[]
	moonMoonPairLabels: string[]
}

export interface TidalContributor {
	idx: number
	label: string
	massKg: number
	diameterKm: number
	positionAt: (t: number) => {
		latRad: number
		lonRad: number
		distanceM: number
	}
	cartesianAt: (t: number) => { x: number; y: number; z: number }
}

export interface SurfaceTidesContribution {
	label: string
	valueM: number
}

export interface SurfaceTidesBreakdown {
	totalM: number
	contributions: SurfaceTidesContribution[]
}

export type EclipseType = "solar-total" | "solar-annular" | "lunar" | "none"
