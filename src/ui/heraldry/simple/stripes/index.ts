import type { StripeDrawParams } from "@/ui/heraldry/simple/stripes/types"

function draw({
	ctx,
	orientation,
	count,
	x,
	y,
	width,
	height,
}: StripeDrawParams) {
	if (orientation === "diagonal") {
		ctx.save()
		ctx.beginPath()
		ctx.rect(x, y, width, height)
		ctx.clip()
		for (let stripe = -count; stripe < count; stripe += 2) {
			const start = stripe / count
			const end = (stripe + 1) / count
			ctx.beginPath()
			ctx.moveTo(x + start * width, y)
			ctx.lineTo(x + end * width, y)
			ctx.lineTo(x + (end + 1) * width, y + height)
			ctx.lineTo(x + (start + 1) * width, y + height)
			ctx.closePath()
			ctx.fill()
		}
		ctx.restore()
		return
	}
	for (let stripe = 1; stripe < count; stripe += 2) {
		if (orientation === "vertical")
			ctx.fillRect(x + (stripe * width) / count, y, width / count, height)
		else ctx.fillRect(x, y + (stripe * height) / count, width, height / count)
	}
}

export const FLAG_STRIPES = { draw }
