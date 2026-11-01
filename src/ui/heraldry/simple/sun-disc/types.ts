import type { FlagDesign } from "@/ui/heraldry/simple/types"

export interface SunDiscPaintParams {
	ctx: CanvasRenderingContext2D
	design: FlagDesign
	width: number
	height: number
}

export interface PolarParams {
	angle: number
	radius: number
}
