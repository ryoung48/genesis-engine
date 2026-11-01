import type {
	PolarParams,
	SunDiscPaintParams,
} from "@/ui/heraldry/simple/sun-disc/types"
import type { FlagPoint } from "@/ui/heraldry/simple/types"

const SUN_DISC = 0.17
const SUN_RAYS = 8
const SUN_TIP = 0.42
const SUN_RAY_HALF_ANGLE = Math.PI / 16
const WAVE_AMPLITUDE = 0.035
const WAVE_CYCLES = 1.5
const WAVE_LINE = 0.024
const WAVE_STEPS = 24

function polar({ angle, radius }: PolarParams): FlagPoint {
	return [Math.cos(angle) * radius, Math.sin(angle) * radius]
}

function paint({ ctx, design, width, height }: SunDiscPaintParams) {
	const aspect = width / height
	switch (design.pattern) {
		case "inti-sun": {
			ctx.save()
			ctx.translate(0.5, 0.46)
			ctx.scale(1, aspect)
			for (let ray = 0; ray < SUN_RAYS; ray++) {
				const angle = (ray * Math.PI * 2) / SUN_RAYS
				ctx.beginPath()
				for (const [index, [x, y]] of [
					polar({ angle: angle - SUN_RAY_HALF_ANGLE, radius: SUN_DISC + 0.03 }),
					polar({ angle, radius: SUN_TIP }),
					polar({ angle: angle + SUN_RAY_HALF_ANGLE, radius: SUN_DISC + 0.03 }),
				].entries()) {
					if (index === 0) ctx.moveTo(x, y)
					else ctx.lineTo(x, y)
				}
				ctx.closePath()
				ctx.fill()
			}
			ctx.strokeStyle = design.colors[1]
			ctx.lineWidth = WAVE_LINE
			ctx.lineCap = "round"
			for (let ray = 0; ray < SUN_RAYS; ray++) {
				const angle = ((ray + 0.5) * Math.PI * 2) / SUN_RAYS
				ctx.beginPath()
				for (let step = 0; step <= WAVE_STEPS; step++) {
					const s = step / WAVE_STEPS
					const [x, y] = polar({
						angle,
						radius: SUN_DISC + 0.04 + s * (SUN_TIP - SUN_DISC - 0.1),
					})
					const sway = WAVE_AMPLITUDE * Math.sin(s * WAVE_CYCLES * Math.PI * 2)
					const px = x - Math.sin(angle) * sway
					const py = y + Math.cos(angle) * sway
					if (step === 0) ctx.moveTo(px, py)
					else ctx.lineTo(px, py)
				}
				ctx.stroke()
			}
			ctx.beginPath()
			ctx.arc(0, 0, SUN_DISC, 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = design.colors[0]
			ctx.beginPath()
			ctx.arc(0, 0, SUN_DISC * 0.72, 0, Math.PI * 2)
			ctx.fill()
			ctx.fillStyle = design.colors[2]
			ctx.beginPath()
			ctx.arc(0, 0, SUN_DISC * 0.42, 0, Math.PI * 2)
			ctx.fill()
			ctx.restore()
			break
		}
	}
}

export const SUN_DISC_HERALDRY = { paint }
