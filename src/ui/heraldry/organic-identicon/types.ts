import type { FlagPoint } from "@/ui/heraldry/simple/types"

export type OrganicUnit = () => number

export type OrganicCurve = readonly [
	number,
	number,
	number,
	number,
	number,
	number,
]

export interface OrganicShape {
	start: FlagPoint
	curves: readonly OrganicCurve[]
}

export interface OrganicPickParams<T> {
	unit: OrganicUnit
	options: readonly T[]
}

export interface OrganicCell {
	shape: OrganicShape
	column: number
	row: number
	turn: number
	flipped: boolean
	color: string
}

export interface OrganicCellPaintParams {
	ctx: CanvasRenderingContext2D
	cell: OrganicCell
	unit: OrganicUnit
}

export interface OrganicCellsParams {
	unit: OrganicUnit
	colors: readonly string[]
}
