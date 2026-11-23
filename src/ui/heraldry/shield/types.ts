export interface ShieldPaintContext {
	ctx: CanvasRenderingContext2D
	width: number
	height: number
}

export type HeraldryShape = "shield" | "flag"

export interface ShieldRenderParams {
	width: number
	shape: HeraldryShape
	field: string
	paint: (context: ShieldPaintContext) => void
}
