import type { MoonBody } from "@/model/celestial/moons"
import type { SystemBody } from "@/model/celestial/system"

export interface SeedForMoonInput {
	parent: SystemBody
	moon: MoonBody
}
