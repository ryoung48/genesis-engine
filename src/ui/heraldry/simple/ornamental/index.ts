import type {
	OrnamentalPaintParams,
	StrandParams,
} from "@/ui/heraldry/simple/ornamental/types"

const STAR_RADIUS = 0.4
const STAR_OUTLINE = 0.014
const LOTUS_PETALS = 8
const LOTUS_OUTER = 0.32
const LOTUS_INNER = 0.21
const LOTUS_WIDTH = 0.1
const LOTUS_DISC = 0.06
const BAND_REACH = 0.9
const BAND_EDGE = 0.17
const BAND_AMPLITUDE = 0.065
const BAND_PERIOD = 0.42
const BAND_STRAND = 0.06
const BAND_GAP = 0.02
const BAND_STEPS = 90

function strand({ ctx, color, phase, gap }: StrandParams) {
	ctx.beginPath()
	for (let step = 0; step <= BAND_STEPS; step++) {
		const x = -BAND_REACH + (2 * BAND_REACH * step) / BAND_STEPS
		const y = phase * BAND_AMPLITUDE * Math.sin((x * Math.PI * 2) / BAND_PERIOD)
		if (step === 0) ctx.moveTo(x, y)
		else ctx.lineTo(x, y)
	}
	ctx.lineCap = "butt"
	ctx.strokeStyle = gap
	ctx.lineWidth = BAND_STRAND + BAND_GAP * 2
	ctx.stroke()
	ctx.strokeStyle = color
	ctx.lineWidth = BAND_STRAND
	ctx.stroke()
}

function paint({ ctx, design, width, height }: OrnamentalPaintParams) {
	const aspect = width / height
	switch (design.pattern) {
		case "octagram": {
			ctx.save()
			ctx.translate(0.5, 0.46)
			ctx.scale(1, aspect)
			ctx.lineJoin = "miter"
			for (const turn of [0, Math.PI / 4]) {
				ctx.beginPath()
				for (let corner = 0; corner < 4; corner++) {
					const angle = turn + Math.PI / 4 + (corner * Math.PI) / 2
					const x = Math.cos(angle) * STAR_RADIUS
					const y = Math.sin(angle) * STAR_RADIUS
					if (corner === 0) ctx.moveTo(x, y)
					else ctx.lineTo(x, y)
				}
				ctx.closePath()
				ctx.fillStyle = design.colors[1]
				ctx.fill()
				ctx.strokeStyle = design.colors[0]
				ctx.lineWidth = STAR_OUTLINE
				ctx.stroke()
			}
			ctx.fillStyle = design.colors[2]
			ctx.beginPath()
			ctx.arc(0, 0, STAR_RADIUS * 0.3, 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = design.colors[0]
			ctx.beginPath()
			ctx.arc(0, 0, STAR_RADIUS * 0.15, 0, Math.PI * 2)
			ctx.fill()
			ctx.restore()
			break
		}
		case "lotus": {
			ctx.save()
			ctx.translate(0.5, 0.46)
			ctx.scale(1, aspect)
			const petals = [
				{ length: LOTUS_OUTER, offset: 0, color: design.colors[1] },
				{
					length: LOTUS_INNER,
					offset: Math.PI / LOTUS_PETALS,
					color: design.colors[2],
				},
			]
			for (const { length, offset, color } of petals) {
				for (let index = 0; index < LOTUS_PETALS; index++) {
					ctx.save()
					ctx.rotate(offset + (index * Math.PI * 2) / LOTUS_PETALS)
					ctx.beginPath()
					ctx.moveTo(0, 0)
					ctx.bezierCurveTo(
						LOTUS_WIDTH,
						-length * 0.35,
						LOTUS_WIDTH * 0.6,
						-length * 0.8,
						0,
						-length,
					)
					ctx.bezierCurveTo(
						-LOTUS_WIDTH * 0.6,
						-length * 0.8,
						-LOTUS_WIDTH,
						-length * 0.35,
						0,
						0,
					)
					ctx.fillStyle = color
					ctx.fill()
					ctx.strokeStyle = design.colors[0]
					ctx.lineWidth = 0.012
					ctx.stroke()
					ctx.restore()
				}
			}
			ctx.fillStyle = design.colors[0]
			ctx.beginPath()
			ctx.arc(0, 0, LOTUS_DISC, 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = design.colors[1]
			ctx.beginPath()
			ctx.arc(0, 0, LOTUS_DISC * 0.6, 0, Math.PI * 2)
			ctx.fill()
			ctx.restore()
			break
		}
		case "arabesque-band": {
			ctx.save()
			ctx.translate(0.5, 0.46)
			ctx.scale(1, aspect)
			ctx.rotate(Math.atan2(1 / aspect, 1))
			ctx.fillStyle = design.colors[1]
			ctx.fillRect(-BAND_REACH, -BAND_EDGE - 0.02, BAND_REACH * 2, 0.02)
			ctx.fillRect(-BAND_REACH, BAND_EDGE, BAND_REACH * 2, 0.02)
			strand({ ctx, color: design.colors[2], phase: -1, gap: design.colors[0] })
			strand({ ctx, color: design.colors[1], phase: 1, gap: design.colors[0] })
			const crossing = BAND_PERIOD / 2
			for (let index = -4; index <= 4; index++) {
				if (index % 2 === 0) continue
				ctx.save()
				ctx.beginPath()
				ctx.rect(
					index * crossing - BAND_STRAND,
					-BAND_AMPLITUDE,
					BAND_STRAND * 2,
					BAND_AMPLITUDE * 2,
				)
				ctx.clip()
				strand({
					ctx,
					color: design.colors[2],
					phase: -1,
					gap: design.colors[0],
				})
				ctx.restore()
			}
			ctx.restore()
			break
		}
	}
}

export const ORNAMENTAL_HERALDRY = { paint }
