import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { PlateMotion } from "@/model/geography/tectonics/plate-motion/types"
import type { SimSpace } from "@/model/geography/tectonics/sim-mesh/types"
import type { SphereMesh } from "@/model/mesh/types"
import type { Vec3 } from "@/model/shared/math/vec3/types"

export interface BuildPlumesParams {
	space: SimSpace
	crust: CrustRaster
	motion: PlateMotion
	seed: number
}

export interface LipLiftParams {
	crust: CrustRaster
	cellOfRegion: Int32Array
	mesh: SphereMesh
	planetRadiusKm: number
}

export interface PlumeLip {
	ageMyr: number
	areaKm2: number
	cells: number
}

export interface Plume {
	id: number
	key: number
	p: Vec3
	cell: number
	plate: number
	strength: number
	trackMyr: number
	// [JUSTIFICATION]: only the plumes whose head made a flood basalt carry one.
	lip?: PlumeLip
}

export interface PlumeRecord {
	plumes: Plume[]
}

export interface StampDiscParams {
	space: SimSpace
	x: Vec3
	radiusKm: number
	fn: (cell: number) => void
}
