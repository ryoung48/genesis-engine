import type {
	ChevronPaintParams,
	TraditionalPaintParams,
} from "@/ui/heraldry/simple/traditional/types"
import type { FlagPoint } from "@/ui/heraldry/simple/types"

function chevron({ ctx, apex, thickness }: ChevronPaintParams) {
	ctx.beginPath()
	ctx.moveTo(-0.2, apex + 0.44)
	ctx.lineTo(0.5, apex)
	ctx.lineTo(1.2, apex + 0.44)
	ctx.lineTo(1.2, apex + 0.44 + thickness)
	ctx.lineTo(0.5, apex + thickness)
	ctx.lineTo(-0.2, apex + 0.44 + thickness)
	ctx.closePath()
	ctx.fill()
}

function paint({ ctx, design, width, height }: TraditionalPaintParams) {
	const polygon = (points: readonly FlagPoint[]) => {
		ctx.beginPath()
		for (const [index, [x, y]] of points.entries()) {
			if (index === 0) ctx.moveTo(x, y)
			else ctx.lineTo(x, y)
		}
		ctx.closePath()
		ctx.fill()
	}
	switch (design.pattern) {
		case "double-chevron":
			chevron({ ctx, apex: 0.06, thickness: 0.14 })
			chevron({ ctx, apex: 0.4, thickness: 0.14 })
			break
		case "chief":
			ctx.fillRect(0, 0, 1, 0.25)
			break
		case "chief-rings":
			ctx.fillRect(0, 0.35, 1, 0.26)
			ctx.fillStyle = design.colors[2]
			ctx.fillRect(0, 0, 1, 0.22)
			ctx.strokeStyle = design.colors[0]
			ctx.lineWidth = 0.025
			for (const x of [0.24, 0.5, 0.76]) {
				ctx.beginPath()
				ctx.ellipse(x, 0.48, 0.075, (0.075 * width) / height, 0, 0, Math.PI * 2)
				ctx.stroke()
			}
			break
		case "label":
			ctx.fillRect(0.1, 0.13, 0.8, 0.055)
			for (const x of [0.17, 0.45, 0.73])
				polygon([
					[x, 0.17],
					[x + 0.1, 0.17],
					[x + 0.12, 0.34],
					[x - 0.02, 0.34],
				])
			break
		case "gyronny":
			for (let wedge = 0; wedge < 8; wedge += 2) {
				const start = (wedge * Math.PI) / 4
				const end = ((wedge + 1) * Math.PI) / 4
				polygon([
					[0.5, 0.46],
					[0.5 + Math.cos(start) * 2, 0.46 + Math.sin(start) * 2],
					[0.5 + Math.cos(end) * 2, 0.46 + Math.sin(end) * 2],
				])
			}
			break
		case "cross-pattee":
		case "cross-engrailed":
			ctx.save()
			ctx.translate(0.5, 0.46)
			ctx.scale(1, width / height)
			if (design.pattern === "cross-pattee") {
				for (let arm = 0; arm < 4; arm++) {
					ctx.save()
					ctx.rotate((arm * Math.PI) / 2)
					polygon([
						[-0.07, 0.02],
						[-0.07, -0.12],
						[-0.17, -0.36],
						[0.17, -0.36],
						[0.07, -0.12],
						[0.07, 0.02],
					])
					ctx.restore()
				}
			} else {
				ctx.fillRect(-0.11, -0.4, 0.22, 0.8)
				ctx.fillRect(-0.4, -0.11, 0.8, 0.22)
				ctx.fillStyle = design.colors[0]
				for (const offset of [-0.36, -0.22, 0.22, 0.36]) {
					for (const edge of [-0.11, 0.11]) {
						for (const [x, y] of [
							[edge, offset],
							[offset, edge],
						]) {
							ctx.beginPath()
							ctx.arc(x, y, 0.05, 0, Math.PI * 2)
							ctx.fill()
						}
					}
				}
			}
			ctx.restore()
			break
	}
}

export const TRADITIONAL_HERALDRY = { paint, chevron }
