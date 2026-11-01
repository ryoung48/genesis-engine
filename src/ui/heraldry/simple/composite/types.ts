import type { FlagCircle, FlagDesign } from "@/ui/heraldry/simple/types"

export interface CompositePaintParams {
	ctx: CanvasRenderingContext2D
	design: FlagDesign
	width: number
	height: number
	circle: (params: FlagCircle) => void
}
