export interface StripeDrawParams {
	ctx: CanvasRenderingContext2D
	orientation: "horizontal" | "vertical" | "diagonal"
	count: number
	x: number
	y: number
	width: number
	height: number
}
