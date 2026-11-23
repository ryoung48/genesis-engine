import type { PlateFronts } from "@/model/geography/tectonics/plate-fronts/types"
import type { MovingPlates } from "@/model/geography/tectonics/plate-motion/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface BuildSeaFloorParams {
	mesh: SphereMesh
	plates: MovingPlates
	fronts: PlateFronts
	planetRadiusKm: number
}

export interface SpreadParams {
	canEnter: (from: number, to: number) => boolean
}
