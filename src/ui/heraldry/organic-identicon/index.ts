import { HASH } from "@/model/shared/random/hash"
import { IDENTICON_HERALDRY } from "@/ui/heraldry/identicon"
import type {
	OrganicCell,
	OrganicCellPaintParams,
	OrganicCellsParams,
	OrganicPickParams,
	OrganicShape,
} from "@/ui/heraldry/organic-identicon/types"
import { HERALDRY_SHIELD } from "@/ui/heraldry/shield"
import type { HeraldryPaintParams } from "@/ui/heraldry/types"

const RNG_SALT = 41
const GRID_CENTER = 2
const GRID_LEFT = 0.4
const GRID_TOP = 1
const WOBBLE = 0.07
const QUARTER_TURN = Math.PI / 2
const SHAPES: readonly OrganicShape[] = [
	{
		start: [0, 0],
		curves: [
			[0.55, 0.1, 0.9, 0.45, 1, 1],
			[0.45, 0.9, 0.1, 0.55, 0, 0],
		],
	},
	{
		start: [0.1, 0],
		curves: [
			[1.1, 0.15, 1.1, 0.85, 0.1, 1],
			[0.6, 0.75, 0.6, 0.25, 0.1, 0],
		],
	},
	{
		start: [1, 0],
		curves: [
			[0.9, 0.45, 0.8, 0.95, 0.4, 0.95],
			[0.1, 0.95, 0.05, 0.55, 0.35, 0.5],
			[0.6, 0.46, 0.8, 0.3, 1, 0],
		],
	},
	{
		start: [0, 1],
		curves: [
			[0.3, 0.75, 0.7, 0.4, 1, 0],
			[0.95, 0.45, 0.95, 0.75, 1, 1],
			[0.7, 0.92, 0.35, 0.92, 0, 1],
		],
	},
	{
		start: [0, 0.2],
		curves: [
			[0.35, -0.05, 0.6, 0.45, 1, 0.15],
			[0.95, 0.35, 0.95, 0.6, 1, 0.8],
			[0.6, 1.05, 0.35, 0.55, 0, 0.85],
			[0.05, 0.6, 0.05, 0.4, 0, 0.2],
		],
	},
	{
		start: [0, 0],
		curves: [
			[0.7, 0.05, 1, 0.4, 1, 1],
			[0.65, 0.8, 0.3, 0.8, 0, 1],
			[0.2, 0.65, 0.2, 0.3, 0, 0],
		],
	},
	{
		start: [0.5, 0],
		curves: [
			[0.6, 0.3, 0.95, 0.45, 0.85, 0.75],
			[0.8, 0.95, 0.6, 1, 0.5, 1],
			[0.4, 1, 0.2, 0.95, 0.15, 0.75],
			[0.05, 0.45, 0.4, 0.3, 0.5, 0],
		],
	},
	{
		start: [0.1, 1],
		curves: [
			[0.05, 0.4, 0.4, 0, 1, 0.05],
			[0.7, 0.2, 0.55, 0.4, 0.55, 0.65],
			[0.55, 0.75, 0.6, 0.85, 0.65, 0.95],
			[0.5, 0.85, 0.35, 0.9, 0.1, 1],
		],
	},
]

function pick<T>({ unit, options }: OrganicPickParams<T>): T {
	return options[Math.floor(unit() * options.length)]
}

function createCells({ unit, colors }: OrganicCellsParams): OrganicCell[] {
	const side = pick({ unit, options: SHAPES })
	const corner = pick({ unit, options: SHAPES.filter((s) => s !== side) })
	const center = pick({
		unit,
		options: SHAPES.filter((s) => s !== side && s !== corner),
	})
	const sideTurn = Math.floor(unit() * 4)
	const cornerTurn = Math.floor(unit() * 4)
	const centerTurn = Math.floor(unit() * 4)
	const mirrored = unit() < 0.5
	return [
		{
			shape: corner,
			column: 0,
			row: 0,
			turn: cornerTurn,
			flipped: false,
			color: colors[1],
		},
		{
			shape: side,
			column: 1,
			row: 0,
			turn: sideTurn,
			flipped: false,
			color: colors[0],
		},
		{
			shape: side,
			column: 2,
			row: 0,
			turn: sideTurn,
			flipped: mirrored,
			color: colors[0],
		},
		{
			shape: center,
			column: 1,
			row: 1,
			turn: centerTurn,
			flipped: false,
			color: colors[2],
		},
	]
}

function paintCell({ ctx, cell, unit }: OrganicCellPaintParams) {
	const { shape, column, row, turn, flipped, color } = cell
	const wobble = () => (unit() - 0.5) * WOBBLE
	ctx.save()
	ctx.translate(column + 0.5, row + 0.5)
	ctx.rotate(turn * QUARTER_TURN)
	ctx.scale(flipped ? -1 : 1, 1)
	ctx.translate(-0.5, -0.5)
	ctx.beginPath()
	ctx.moveTo(shape.start[0], shape.start[1])
	for (const [x1, y1, x2, y2, x, y] of shape.curves) {
		ctx.bezierCurveTo(
			x1 + wobble(),
			y1 + wobble(),
			x2 + wobble(),
			y2 + wobble(),
			x,
			y,
		)
	}
	ctx.closePath()
	ctx.fillStyle = color
	ctx.fill()
	ctx.restore()
}

function paint({ ctx, seed, width, height, hue }: HeraldryPaintParams) {
	const style = IDENTICON_HERALDRY.style({ name: seed, forcedHue: hue })
	const hash = HASH.keyed({ seed: 0, key: seed }) >>> 0
	let channel = 0
	const unit = () =>
		HASH.unit({ seed: hash, channel: channel++, salt: RNG_SALT })
	const colors = [
		style.lightness[0],
		style.lightness[1],
		style.grayscaleLightness[0],
	].map((lightness) =>
		IDENTICON_HERALDRY.color({
			hue: style.hue,
			saturation: style.saturation,
			lightness,
		}),
	)
	const cells = createCells({ unit, colors })
	ctx.save()
	ctx.fillStyle = style.backColor
	ctx.fillRect(0, 0, width, height)
	ctx.scale(
		width / HERALDRY_SHIELD.fieldWidth,
		height / HERALDRY_SHIELD.fieldHeight,
	)
	ctx.translate(GRID_LEFT, GRID_TOP)
	for (let quadrant = 0; quadrant < 4; quadrant++) {
		ctx.save()
		ctx.translate(GRID_CENTER, GRID_CENTER)
		ctx.rotate(quadrant * QUARTER_TURN)
		ctx.translate(-GRID_CENTER, -GRID_CENTER)
		for (const cell of cells) paintCell({ ctx, cell, unit })
		ctx.restore()
	}
	ctx.restore()
}

export const ORGANIC_IDENTICON_HERALDRY = { paint }
