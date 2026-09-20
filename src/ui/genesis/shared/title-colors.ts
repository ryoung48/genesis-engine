import type { TitleTier } from "@/model/society/titles/types"

export const TITLE_TIER_COLORS: Record<TitleTier, [number, number, number]> = {
	county: [0.86, 0.83, 0.7],
	duchy: [0.6, 0.78, 0.5],
	kingdom: [0.3, 0.62, 0.78],
	empire: [0.56, 0.4, 0.82],
	hegemony: [0.95, 0.75, 0.15],
}

export const TITLE_TIER_LABELS: Record<TitleTier, string> = {
	county: "County",
	duchy: "Duchy",
	kingdom: "Kingdom",
	empire: "Empire",
	hegemony: "Hegemony",
}

interface TintNationColorParams {
	base: readonly [number, number, number]
	index: number
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	if (max === min) return [0, 0, l]
	const d = max - min
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
	let h: number
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
	else if (max === g) h = (b - r) / d + 2
	else h = (r - g) / d + 4
	return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	if (s === 0) return [l, l, l]
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s
	const p = 2 * l - q
	const channel = (t: number) => {
		let x = t
		if (x < 0) x += 1
		if (x > 1) x -= 1
		if (x < 1 / 6) return p + (q - p) * 6 * x
		if (x < 1 / 2) return q
		if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
		return p
	}
	return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
}

export function tintNationColor({
	base,
	index,
}: TintNationColorParams): [number, number, number] {
	const [h, s, l] = rgbToHsl(base[0], base[1], base[2])
	const hueOffset = ((index * 0.6180339887) % 1) - 0.5
	const lightnessOffset = ((index % 3) - 1) * 0.11
	return hslToRgb(
		(h + hueOffset * 0.14 + 1) % 1,
		Math.min(1, s * 1.05),
		Math.max(0.2, Math.min(0.8, l + lightnessOffset)),
	)
}
