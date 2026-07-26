import type { MoonBody } from "@/model/celestial/moons/types"
import type { SystemBody } from "@/model/celestial/system/types"

export interface SeedForMoonInput {
	parent: SystemBody
	moon: MoonBody
}

export interface SeismologyProfile {
	residualHeating: number
	tidalHeating: number
	surfaceTidesHeating: number
	totalHeating: number
	regime: "dead" | "low" | "active" | "extreme"
}
