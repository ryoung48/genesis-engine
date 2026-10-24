import type { GenesisParams } from "@/model/pipelines/types"

export type ClimateV2OrbitParams = Pick<
	GenesisParams,
	| "obliquity"
	| "eccentricity"
	| "perihelion"
	| "hoursPerDay"
	| "daysPerYear"
	| "spectralClass"
	| "starSubtype"
	| "orbitalDistanceAU"
	| "planetRadiusKm"
>

export type SolarHoursParams = Pick<
	ClimateV2OrbitParams,
	"obliquity" | "hoursPerDay" | "daysPerYear"
>

export type StarLightParams = Pick<
	ClimateV2OrbitParams,
	"spectralClass" | "starSubtype" | "orbitalDistanceAU"
>
