import type { MoonBody } from "@/model/celestial/moons/types"
import type { SystemBody } from "@/model/celestial/system/types"

export interface MoonTidalHeatingInput {
	parent: SystemBody
	moon: MoonBody
}
