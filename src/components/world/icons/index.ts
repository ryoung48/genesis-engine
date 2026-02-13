"use client"
import { DrawIconParams } from "./types"

export const ICON = {
	draw: ({ ctx, img, icon, sw, sh, point, bigger }: DrawIconParams) => {
		const h = icon.height * (bigger ? 2 : 1)
		const scale = img.height / h
		const w = img.width / scale
		const height = h * sh
		const width = w * sw
		ctx.globalAlpha = icon.opacity
		try {
			ctx.drawImage(
				img,
				point.x - width / 2,
				point.y - height / 2,
				width,
				height,
			)
		} catch (e) {
			console.log(icon)
			throw e
		}
		return { width: width * sw, height: height * sh }
	},
}
