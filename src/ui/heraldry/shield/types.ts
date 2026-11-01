export interface ShieldPaintContext {
	ctx: CanvasRenderingContext2D
	width: number
	height: number
}

export interface ShieldRenderParams {
	width: number
	field: string
	paint: (context: ShieldPaintContext) => void
}
