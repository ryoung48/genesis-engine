import type { CompositePaintParams } from "@/ui/heraldry/simple/composite/types"
import { FLAG_STRIPES } from "@/ui/heraldry/simple/stripes"
import type { FlagCircle } from "@/ui/heraldry/simple/types"

function paint({ ctx, design, width, height, circle }: CompositePaintParams) {
	const cross = ({ x, y, radius }: FlagCircle) => {
		const verticalRadius = (radius * width) / height
		ctx.fillRect(
			x - radius * 0.3,
			y - verticalRadius,
			radius * 0.6,
			verticalRadius * 2,
		)
		ctx.fillRect(
			x - radius,
			y - verticalRadius * 0.3,
			radius * 2,
			verticalRadius * 0.6,
		)
	}
	switch (design.pattern) {
		case "split-stripes-crosses":
		case "split-stripes-roundels":
			FLAG_STRIPES.draw({
				ctx,
				orientation: "vertical",
				count: design.stripeCount,
				x: 0,
				y: 0,
				width: 0.46,
				height: 1,
			})
			ctx.fillStyle = design.colors[2]
			for (const y of [0.28, 0.65]) {
				const draw = design.pattern === "split-stripes-crosses" ? cross : circle
				draw({ x: 0.73, y, radius: 0.115 })
			}
			break
		case "quartered-stripes-crosses":
		case "quartered-stripes-roundels":
			FLAG_STRIPES.draw({
				ctx,
				orientation: "vertical",
				count: 5,
				x: 0,
				y: 0,
				width: 0.5,
				height: 0.5,
			})
			FLAG_STRIPES.draw({
				ctx,
				orientation: "vertical",
				count: 5,
				x: 0.5,
				y: 0.5,
				width: 0.5,
				height: 0.5,
			})
			ctx.fillStyle = design.colors[2]
			for (const [x, y] of [
				[0.75, 0.25],
				[0.25, 0.7],
			]) {
				const draw =
					design.pattern === "quartered-stripes-crosses" ? cross : circle
				draw({ x, y, radius: 0.12 })
			}
			break
		case "striped-roundel":
		case "vertical-striped-roundel":
			FLAG_STRIPES.draw({
				ctx,
				orientation:
					design.pattern === "vertical-striped-roundel"
						? "vertical"
						: "horizontal",
				count: design.stripeCount,
				x: 0,
				y: 0,
				width: 1,
				height: 1,
			})
			ctx.fillStyle = design.colors[0]
			circle({ x: 0.5, y: 0.46, radius: design.roundelRadius + 0.04 })
			ctx.fillStyle = design.colors[2]
			circle({ x: 0.5, y: 0.46, radius: design.roundelRadius })
			break
		case "striped-cross":
			FLAG_STRIPES.draw({
				ctx,
				orientation: "horizontal",
				count: design.stripeCount,
				x: 0,
				y: 0,
				width: 1,
				height: 1,
			})
			ctx.fillStyle = design.colors[0]
			ctx.fillRect(0.35, 0, 0.3, 1)
			ctx.fillRect(0, 0.33, 1, 0.26)
			ctx.fillStyle = design.colors[2]
			ctx.fillRect(0.41, 0, 0.18, 1)
			ctx.fillRect(0, 0.39, 1, 0.14)
			break
		case "striped-crosses":
			FLAG_STRIPES.draw({
				ctx,
				orientation: "vertical",
				count: design.stripeCount,
				x: 0,
				y: 0,
				width: 1,
				height: 1,
			})
			ctx.fillStyle = design.colors[0]
			ctx.fillRect(0.33, 0, 0.34, 1)
			ctx.fillStyle = design.colors[2]
			for (const y of [0.22, 0.46, 0.7]) cross({ x: 0.5, y, radius: 0.1 })
			break
	}
}

export const COMPOSITE_HERALDRY = { paint }
