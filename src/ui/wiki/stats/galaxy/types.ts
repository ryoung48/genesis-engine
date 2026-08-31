import type { GalaxySystem } from "@/model/celestial/galaxy/systems/types"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { SystemBody } from "@/model/celestial/system/types"

export interface BodyClassificationSelection {
	systems: readonly GalaxySystem[]
	bodyKind: "planet" | "moon"
	classification: string
}

export interface ClassifiedBodies {
	planets: SystemBody[]
	moons: MoonBody[]
}
