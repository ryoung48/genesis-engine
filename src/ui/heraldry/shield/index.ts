import type {
	HeraldryShape,
	ShieldRenderParams,
} from "@/ui/heraldry/shield/types"

const WIDTH = 4.8
const SHIELD_HEIGHT = 7
const SHIELD_CURVE_HEIGHT_RATIO = 0.25
const FLAG_HEIGHT = (WIDTH * 2) / 3
const BORDER_WIDTH = 0.2
const TEXTURE_WIDTH = WIDTH + BORDER_WIDTH

function shieldOutline(): Path2D {
	const flatHeight = SHIELD_HEIGHT * (1 - SHIELD_CURVE_HEIGHT_RATIO)
	const path = new Path2D()
	path.moveTo(0, 0)
	path.lineTo(WIDTH, 0)
	path.lineTo(WIDTH, flatHeight)
	path.quadraticCurveTo(WIDTH / 2, SHIELD_HEIGHT, 0, flatHeight)
	path.lineTo(0, 0)
	return path
}

function flagOutline(): Path2D {
	const path = new Path2D()
	path.rect(0, 0, WIDTH, FLAG_HEIGHT)
	return path
}

const SHAPES: Record<HeraldryShape, { extent: number; outline: () => Path2D }> =
	{
		shield: {
			extent: SHIELD_HEIGHT * (1 - SHIELD_CURVE_HEIGHT_RATIO / 2),
			outline: shieldOutline,
		},
		flag: { extent: FLAG_HEIGHT, outline: flagOutline },
	}

function textureHeight(shape: HeraldryShape): number {
	return SHAPES[shape].extent + BORDER_WIDTH
}

function aspect(shape: HeraldryShape): number {
	return TEXTURE_WIDTH / textureHeight(shape)
}

function render({
	width,
	shape,
	field,
	paint,
}: ShieldRenderParams): HTMLCanvasElement | null {
	const { extent, outline } = SHAPES[shape]
	const height = textureHeight(shape)
	const canvas = document.createElement("canvas")
	canvas.width = width
	canvas.height = Math.round(width / aspect(shape))
	const ctx = canvas.getContext("2d")
	if (!ctx) return null
	ctx.scale(canvas.width / TEXTURE_WIDTH, canvas.height / height)
	ctx.translate(BORDER_WIDTH / 2, BORDER_WIDTH / 2)
	const path = outline()
	ctx.fillStyle = field
	ctx.fill(path)
	ctx.save()
	ctx.clip(path)
	paint({ ctx, width: WIDTH, height: extent })
	ctx.restore()
	ctx.strokeStyle = "#000000"
	ctx.lineWidth = BORDER_WIDTH
	ctx.stroke(path)
	return canvas
}

export const HERALDRY_SHIELD = {
	render,
	aspect,
	fieldWidth: WIDTH,
	fieldHeight: SHAPES.shield.extent,
}
