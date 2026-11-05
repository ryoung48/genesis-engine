import type { MoonBody } from "@/model/celestial/moons/types"
import type { GenesisParams } from "@/model/pipelines/types"

export interface SkyPrecessionRatesParams {
	params: GenesisParams
	moon: MoonBody
}
export interface SkyPrecessionMoonsParams {
	params: GenesisParams
	moons: MoonBody[]
	seconds: number
}
