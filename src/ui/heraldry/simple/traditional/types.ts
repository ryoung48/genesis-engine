import type { FlagDesign } from "@/ui/heraldry/simple/types"

export interface TraditionalPaintParams {
	ctx: CanvasRenderingContext2D
	design: FlagDesign
	width: number
	height: number
}

export interface ChevronPaintParams {
	ctx: CanvasRenderingContext2D
	apex: number
	thickness: number
}
