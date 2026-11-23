import type {
	PlateFronts,
	SubductionFront,
} from "@/model/geography/tectonics/plate-fronts/types"
import type {
	MovingPlates,
	PlateMotion,
} from "@/model/geography/tectonics/plate-motion/types"
import type { SphereMesh } from "@/model/mesh/types"

export interface BuildArcCrustParams {
	mesh: SphereMesh
	planetRadiusKm: number
	seed: number
	motion: PlateMotion
	fronts: PlateFronts
	seaAgeMyr: Float32Array
}

export interface ArcFrontReport {
	id: number
	activeMyr: number
	arcSources: number[]
	arcCells: number
	splitSources: number[]
	splitChance: number
	sunda: boolean
	seaCells: number
	islandCells: number
	fragmentCells: number
	sundaDeepCells: number
}

export interface ArcCrust {
	crustType: Uint8Array
	formedAtMyr: Float32Array
	shelfSea: Uint8Array
	sundaDeep: Uint8Array
	arcFront: Uint8Array
	reports: ArcFrontReport[]
}

export interface DistanceFromParams {
	sources: number[]
	reaches: number[]
	allowed: (cell: number) => boolean
}

export interface DistanceField {
	km: Float64Array
	reach: Float32Array
	src: Int32Array
}

export interface StrikeParams {
	cell: number
	waveKm: number
	offset: number
}

export interface StageContext {
	mesh: SphereMesh
	edgeKm: number
	seed: number
	motion: PlateMotion
	fronts: PlateFronts
	seaAgeMyr: Float32Array
	crust: ArcCrust
	contKm: Float64Array
	strike: (params: StrikeParams) => number
	distanceFrom: (params: DistanceFromParams) => DistanceField
	sundaFronts: number
}

export interface FrontParams {
	ctx: StageContext
	front: SubductionFront
}

export interface FrontReportParams extends FrontParams {
	report: ArcFrontReport
}

export interface Keep {
	cell: number
	setback: number
	reach: number
	grow: number
	age: number
}

export interface SlotKmParams {
	mesh: SphereMesh
	radiusKm: number
}

export interface MakeDistanceFromParams {
	mesh: SphereMesh
	slotKm: Float32Array
}

export interface CellParams {
	ctx: StageContext
	cell: number
}

export interface TowardTrenchParams {
	ctx: StageContext
	over: number
	down: number
}

export interface SidesOfParams {
	ctx: StageContext
	edge: number
}

export interface RunArcCrustParams {
	mesh: SphereMesh
	planetRadiusKm: number
	seed: number
	plates: MovingPlates
}

export interface ArcCrustRun {
	crust: ArcCrust
	motion: PlateMotion
	fronts: PlateFronts
	seaAgeMyr: Float32Array
}
