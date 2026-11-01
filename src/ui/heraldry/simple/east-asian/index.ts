import { HASH } from "@/model/shared/random/hash"
import type { EastAsianPaintParams } from "@/ui/heraldry/simple/east-asian/types"
import type { FlagPoint } from "@/ui/heraldry/simple/types"

const TOMOE_COUNT = 3
const TOMOE_HEAD_RADIUS = 0.068
const TOMOE_ORBIT = 0.2
const TOMOE_SWEEP = ((Math.PI * 2) / 3) * 0.85
const TOMOE_STEPS = 24
const SUN_WEDGES = 8
const SUN_RADIUS = 0.15
const TRIGRAM_WIDTH = 0.54
const TRIGRAM_BAR = 0.12
const TRIGRAM_GAP = 0.08
const TRIGRAM_BREAK = 0.11

function paint({ ctx, design, width, height }: EastAsianPaintParams) {
	const aspect = width / height
	const polygon = (points: readonly FlagPoint[]) => {
		ctx.beginPath()
		for (const [index, [x, y]] of points.entries()) {
			if (index === 0) ctx.moveTo(x, y)
			else ctx.lineTo(x, y)
		}
		ctx.closePath()
		ctx.fill()
	}
	const circle = (radius: number, x: number, y: number) => {
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, Math.PI * 2)
		ctx.fill()
	}
	switch (design.pattern) {
		case "tomoe":
			ctx.save()
			ctx.translate(0.5, 0.46)
			ctx.scale(1, aspect)
			for (let index = 0; index < TOMOE_COUNT; index++) {
				const start = (index * Math.PI * 2) / TOMOE_COUNT - Math.PI / 2
				const outer: FlagPoint[] = []
				const inner: FlagPoint[] = []
				for (let step = 0; step <= TOMOE_STEPS; step++) {
					const t = step / TOMOE_STEPS
					const angle = start + t * TOMOE_SWEEP
					const half = TOMOE_HEAD_RADIUS * (1 - t)
					outer.push([
						Math.cos(angle) * (TOMOE_ORBIT + half),
						Math.sin(angle) * (TOMOE_ORBIT + half),
					])
					inner.push([
						Math.cos(angle) * (TOMOE_ORBIT - half),
						Math.sin(angle) * (TOMOE_ORBIT - half),
					])
				}
				polygon([...outer, ...inner.reverse()])
				circle(
					TOMOE_HEAD_RADIUS,
					Math.cos(start) * TOMOE_ORBIT,
					Math.sin(start) * TOMOE_ORBIT,
				)
			}
			ctx.restore()
			break
		case "rising-sun":
			ctx.save()
			ctx.translate(0.5, 1)
			ctx.scale(1, aspect)
			for (let wedge = 0; wedge < SUN_WEDGES; wedge++) {
				const start = Math.PI + (wedge * 2 * Math.PI) / (SUN_WEDGES * 2)
				const end = start + Math.PI / (SUN_WEDGES * 2)
				polygon([
					[0, 0],
					[Math.cos(start) * 3, Math.sin(start) * 3],
					[Math.cos(end) * 3, Math.sin(end) * 3],
				])
			}
			ctx.fillStyle = design.colors[2]
			ctx.beginPath()
			ctx.arc(0, 0, SUN_RADIUS, Math.PI, Math.PI * 2)
			ctx.fill()
			ctx.restore()
			break
		case "trigram-bars": {
			const hash = HASH.keyed({ seed: 0, key: design.seed }) >>> 0
			const total = 3 * TRIGRAM_BAR + 2 * TRIGRAM_GAP
			const left = 0.5 - TRIGRAM_WIDTH / 2
			for (let bar = 0; bar < 3; bar++) {
				const y = 0.46 - total / 2 + bar * (TRIGRAM_BAR + TRIGRAM_GAP)
				if (HASH.unit({ seed: hash, channel: bar, salt: 0 }) < 0.5) {
					ctx.fillRect(left, y, TRIGRAM_WIDTH, TRIGRAM_BAR)
					continue
				}
				const half = (TRIGRAM_WIDTH - TRIGRAM_BREAK) / 2
				ctx.fillRect(left, y, half, TRIGRAM_BAR)
				ctx.fillRect(left + half + TRIGRAM_BREAK, y, half, TRIGRAM_BAR)
			}
			break
		}
	}
}

export const EAST_ASIAN_HERALDRY = { paint }
