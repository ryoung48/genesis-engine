import type { HslToRgbParams } from "@/model/history/earth/color/types"
import { DYNASTY_COLOR_PALETTE } from "@/model/history/earth/dynasty-color-palette"

function hashColorForKey(key: string): [number, number, number] {
	let h = 0
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
	const hue = (h % 360) / 360
	return hslToRgb({ h: hue, s: 0.55, l: 0.5 })
}

function hslToRgb({ h, s, l }: HslToRgbParams): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s
	const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
	const m = l - c / 2
	let r = 0
	let g = 0
	let b = 0
	const seg = Math.floor(h * 6)
	if (seg === 0) {
		r = c
		g = x
	} else if (seg === 1) {
		r = x
		g = c
	} else if (seg === 2) {
		g = c
		b = x
	} else if (seg === 3) {
		g = x
		b = c
	} else if (seg === 4) {
		r = x
		b = c
	} else {
		r = c
		b = x
	}
	return [r + m, g + m, b + m]
}

function rgb01ToCss([r, g, b]: [number, number, number]): string {
	return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

const DYNASTY_PALETTE_RGB: Array<[number, number, number]> =
	DYNASTY_COLOR_PALETTE.map(([r, g, b]) => [r / 255, g / 255, b / 255])

function dynastyColor(dynasty: string): [number, number, number] {
	let hash = 0
	for (let index = 0; index < dynasty.length; index++) {
		hash = (hash * 31 + dynasty.charCodeAt(index)) | 0
	}
	return DYNASTY_PALETTE_RGB[Math.abs(hash) % DYNASTY_PALETTE_RGB.length]
}

export const COLOR = {
	hashColorForKey,
	rgb01ToCss,
	dynastyColor,
}
