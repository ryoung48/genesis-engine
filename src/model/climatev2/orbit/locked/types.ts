import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisParams } from "@/model/pipelines/types"

/** Physical stellar radiation values for a rolled galaxy host.
 * [JUSTIFICATION] Authored systems still derive these from class/subtype. */
export interface LockedStarRadiationParams {
	starTemperatureK?: number
	starDiameterSol?: number
}

export type MonthlyLibrationParams = {
	eccentricity: number
	perihelion: number
}

export type LockedDeclinationParams = {
	obliquity: number
	eccentricity: number
	perihelion: number
}

export type SubstellarDirectionParams = {
	substellarLon: number
	lonOffsetRad: number
	declinationRad: number
}

export type LockedMonthlyDaylightHoursParams = {
	mesh: SphereMesh
	params: Pick<
		GenesisParams,
		| "substellarLon"
		| "eccentricity"
		| "hoursPerDay"
		| "obliquity"
		| "perihelion"
	>
}
