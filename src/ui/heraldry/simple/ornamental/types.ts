import type { FlagDesign } from "@/ui/heraldry/simple/types"

export interface OrnamentalPaintParams {
	ctx: CanvasRenderingContext2D
	design: FlagDesign
	width: number
	height: number
}

export interface StrandParams {
	ctx: CanvasRenderingContext2D
	color: string
	phase: 1 | -1
	gap: string
}
