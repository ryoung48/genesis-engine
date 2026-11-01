import type { ShieldRenderParams } from "@/ui/heraldry/shield/types"

const WIDTH = 4.8
const HEIGHT = 7
const CURVE_HEIGHT_RATIO = 0.25
const BORDER_WIDTH = 0.2
const TEXTURE_WIDTH = WIDTH + BORDER_WIDTH
const FIELD_HEIGHT = HEIGHT * (1 - CURVE_HEIGHT_RATIO / 2)
const TEXTURE_HEIGHT = FIELD_HEIGHT + BORDER_WIDTH
const aspect = TEXTURE_WIDTH / TEXTURE_HEIGHT

function render({
	width,
	field,
	paint,
}: ShieldRenderParams): HTMLCanvasElement | null {
	const canvas = document.createElement("canvas")
	canvas.width = width
	canvas.height = Math.round(width / aspect)
	const ctx = canvas.getContext("2d")
	if (!ctx) return null
	ctx.scale(canvas.width / TEXTURE_WIDTH, canvas.height / TEXTURE_HEIGHT)
	ctx.translate(BORDER_WIDTH / 2, BORDER_WIDTH / 2)
	const flatHeight = HEIGHT * (1 - CURVE_HEIGHT_RATIO)
	const shield = new Path2D()
	shield.moveTo(0, 0)
	shield.lineTo(WIDTH, 0)
	shield.lineTo(WIDTH, flatHeight)
	shield.quadraticCurveTo(WIDTH / 2, HEIGHT, 0, flatHeight)
	shield.lineTo(0, 0)
	ctx.fillStyle = field
	ctx.fill(shield)
	ctx.save()
	ctx.clip(shield)
	paint({ ctx, width: WIDTH, height: FIELD_HEIGHT })
	ctx.restore()
	ctx.strokeStyle = "#000000"
	ctx.lineWidth = BORDER_WIDTH
	ctx.stroke(shield)
	return canvas
}

export const HERALDRY_SHIELD = {
	render,
	aspect,
	fieldWidth: WIDTH,
	fieldHeight: FIELD_HEIGHT,
}
