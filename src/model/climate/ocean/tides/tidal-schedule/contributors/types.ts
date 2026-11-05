import type { MoonBody } from "@/model/celestial/moons/types"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import type { GenesisParams } from "@/model/pipelines/types"

export type StarMassParams = Pick<
	GenesisParams,
	"spectralClass" | "starSubtype"
>

export type StarDiameterParams = Pick<
	GenesisParams,
	"spectralClass" | "starSubtype" | "starDiameterSol"
>

export interface PrepareContributorsParams {
	moons: MoonBody[]
	params: Pick<
		GenesisParams,
		"planetRadiusKm" | "orbitalDistanceAU" | "spectralClass" | "starSubtype"
	>
}

export interface PreparedContributors {
	moons: MoonBody[]
	moonsClamped: boolean
}

export interface ValidateMoonParams {
	moon: MoonBody
	planetMassKg: number
	starMassKg: number
	planetRadiusKm: number
	orbitalDistanceAU: number
}

export interface LockedToMoonParams {
	tideLock: TideLock | null
	moon: Pick<MoonBody, "idx">
}
