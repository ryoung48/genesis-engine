import type { CrustRaster } from "@/model/geography/tectonics/crust/types"
import type { PlateMotion } from "@/model/geography/tectonics/plate-motion/types"
import type { SimSpace } from "@/model/geography/tectonics/sim-mesh/types"
import type { SimFront } from "@/model/geography/tectonics/world-sample/types"

export interface SimArcSample {
	formedAtMyr: Float32Array
	arcFront: Uint8Array
	shelfSea: Uint8Array
}

export interface InitCrustParams {
	space: SimSpace
	plate: Int32Array
	crustType: Uint8Array
	seaAgeMyr: Float32Array
	arc: SimArcSample
}

export interface BuildBeltRecordsParams {
	seed: number
	space: SimSpace
	crust: CrustRaster
	motion: PlateMotion
	simFronts: SimFront[]
	seaAgeMyr: Float32Array
	featureMask: Uint32Array
	arc: SimArcSample
}

export interface BeltReport {
	kind: SimFront["kind"]
	id: number
	sources: number
	reached: number
}

export interface BeltRecords {
	footprint: Uint8Array
	reports: BeltReport[]
}

export interface FrontContext {
	params: BuildBeltRecordsParams
	front: SimFront
	footprint: Uint8Array
	landCells: Map<number, number>
	reports: BeltReport[]
}

export interface SpreadFrontParams {
	ctx: FrontContext
	plate: number
	type: number
	side: number
	cells: number[]
	widths: number[]
	works: number[]
	shears: number[]
	amps: number[]
	oceanBits: boolean
}

export interface DownCellParams {
	ctx: FrontContext
	cell: number
	plate: number
}

export interface BeltLists {
	cells: number[]
	widths: number[]
	works: number[]
	shears: number[]
	amps: number[]
}

export interface PushBeltParams {
	list: BeltLists
	cell: number
	work: number
	shear: number
	width: number
}

export interface FrontMotionParams {
	ctx: FrontContext
	i: number
}

export interface SegOfParams {
	crust: CrustRaster
	seed: number
	cell: number
}
