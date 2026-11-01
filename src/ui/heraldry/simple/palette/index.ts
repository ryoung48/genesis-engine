import * as THREE from "three"
import type {
	PaletteColors,
	PaletteFitParams,
} from "@/ui/heraldry/simple/palette/types"

const CHROMA_FLOOR = 0.12
const ROTATION_REACH = 45
const ANALOGOUS_SPREAD = 40
const PASTEL_LIGHTNESS = 0.72
const ACCENT_NEUTRAL_LIGHTNESS = 0.8
const ACCENT_SATURATION = 0.45
const ACCENT_LIGHTNESS = 0.78
const YELLOW_MIN = 40
const YELLOW_MAX = 70
const LIGHT_KNEE = 0.35
const LIGHT_SLOPE = 0.28
const MAX_SATURATION = 0.55
const CYAN_MIN = 150
const CYAN_MAX = 210
const CYAN_LIGHT_FROM = 0.5
const CYAN_LIGHT_SATURATION_SCALE = 0.6
const YELLOW_DARK_SHIFT = 5
const YELLOW_DARK_SATURATION = 0.7
const YELLOW_MIN_LIGHTNESS = 0.42
const GREEN_MIN = 75
const GREEN_MAX = 165
const WARM_MIN = 300
const WARM_MAX = 45

const CANDIDATES: readonly PaletteColors[] = [
	["#f4f1e7", "#b52f3b", "#25262c"],
	["#f5e8b8", "#ac293d", "#203a67"],
	["#f4f1e7", "#24734e", "#202936"],
	["#e8be49", "#25262c", "#a52935"],
	["#22588b", "#f4f1e7", "#e8be49"],
	["#6f294c", "#e8be49", "#f4f1e7"],
	["#286248", "#e8be49", "#b4363f"],
	["#242735", "#f4f1e7", "#8452a1"],
	["#277e8b", "#f5e8b8", "#c26438"],
	["#b3d6d2", "#24495d", "#b14554"],
	["#d5bbd7", "#653064", "#f5e8b8"],
	["#f4f1e7", "#2b5d8c", "#16253a"],
	["#16253a", "#f4f1e7", "#6fa0d0"],
	["#e9e7e1", "#2b5d8c", "#f4f1e7"],
	["#2b5d8c", "#f4f1e7", "#9cc0e3"],
	["#25262c", "#e8be49", "#f4f1e7"],
	["#f4f1e7", "#d9a535", "#25262c"],
	["#25262c", "#f4f1e7", "#e8be49"],
]

interface SettleParams {
	color: HslColor
	keepLight: boolean
}

interface HslColor {
	h: number
	s: number
	l: number
}

interface HueSample {
	hue: number
	lightness: number
	chroma: number
}

function sampleColor(color: string): HueSample {
	const parsed = new THREE.Color(color)
	const hsl = { h: 0, s: 0, l: 0 }
	parsed.getHSL(hsl, THREE.SRGBColorSpace)
	const rgb = { r: 0, g: 0, b: 0 }
	parsed.getRGB(rgb, THREE.SRGBColorSpace)
	return {
		hue: hsl.h * 360,
		lightness: hsl.l,
		chroma: Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b),
	}
}

function analogous(palette: PaletteColors) {
	const hues = palette
		.map(sampleColor)
		.filter((entry) => entry.chroma >= CHROMA_FLOOR)
		.map((entry) => entry.hue)
	return hues.every((from) =>
		hues.every((to) => Math.abs(signedGap({ from, to })) <= ANALOGOUS_SPREAD),
	)
}

function clashes(palette: PaletteColors) {
	const chromatic = palette
		.map(sampleColor)
		.filter((entry) => entry.chroma >= CHROMA_FLOOR)
	const green = chromatic.some(
		(entry) => entry.hue >= GREEN_MIN && entry.hue <= GREEN_MAX,
	)
	const warm = chromatic.some(
		(entry) => entry.hue >= WARM_MIN || entry.hue <= WARM_MAX,
	)
	return green && warm
}

function pastelField(palette: PaletteColors) {
	return [palette[0], palette[1]].some((color) => {
		const entry = sampleColor(color)
		return entry.chroma >= CHROMA_FLOOR && entry.lightness > PASTEL_LIGHTNESS
	})
}

const PALETTES = CANDIDATES.filter(
	(palette) => !clashes(palette) && !pastelField(palette),
)

function primaryIndex(palette: PaletteColors) {
	const samples = palette.map(sampleColor)
	return samples.reduce(
		(best, entry, index) =>
			entry.chroma > samples[best].chroma ? index : best,
		0,
	)
}

function primaryHue(palette: PaletteColors) {
	return sampleColor(palette[primaryIndex(palette)]).hue
}

function signedGap({ from, to }: { from: number; to: number }) {
	return ((((to - from) % 360) + 540) % 360) - 180
}

function settle({ color, keepLight }: SettleParams): HslColor {
	const l =
		keepLight || color.l <= LIGHT_KNEE
			? color.l
			: LIGHT_KNEE + (color.l - LIGHT_KNEE) * LIGHT_SLOPE
	const s = Math.min(color.s, MAX_SATURATION)
	if (color.h >= YELLOW_MIN && color.h <= YELLOW_MAX)
		return {
			h: color.h - YELLOW_DARK_SHIFT,
			s: Math.max(s, YELLOW_DARK_SATURATION),
			l: Math.max(l, YELLOW_MIN_LIGHTNESS),
		}
	const lightCyan =
		color.h >= CYAN_MIN && color.h <= CYAN_MAX && l > CYAN_LIGHT_FROM
	return {
		h: color.h,
		s: lightCyan ? s * CYAN_LIGHT_SATURATION_SCALE : s,
		l,
	}
}

function rotate({
	palette,
	delta,
}: {
	palette: PaletteColors
	delta: number
}): PaletteColors {
	const rotated = palette.map((color, slot) => {
		const parsed = new THREE.Color(color)
		const hsl = { h: 0, s: 0, l: 0 }
		parsed.getHSL(hsl, THREE.SRGBColorSpace)
		if (sampleColor(color).chroma < CHROMA_FLOOR) return color
		const next = settle({
			color: {
				h: (((hsl.h * 360 + delta) % 360) + 360) % 360,
				s: hsl.s,
				l: hsl.l,
			},
			keepLight: slot === 2,
		})
		parsed.setHSL(next.h / 360, next.s, next.l, THREE.SRGBColorSpace)
		return `#${parsed.getHexString(THREE.SRGBColorSpace)}`
	})
	return [rotated[0], rotated[1], rotated[2]]
}

function arrange(palette: PaletteColors): PaletteColors {
	return primaryIndex(palette) === 2
		? [palette[0], palette[2], palette[1]]
		: palette
}

function tintAccent(colors: PaletteColors): PaletteColors {
	const accent = sampleColor(colors[2])
	if (
		accent.chroma >= CHROMA_FLOOR ||
		accent.lightness < ACCENT_NEUTRAL_LIGHTNESS
	)
		return colors
	const samples = colors.map(sampleColor)
	const dominant = samples.reduce((best, entry) =>
		entry.chroma > best.chroma ? entry : best,
	)
	if (dominant.chroma < CHROMA_FLOOR) return colors
	const toned = settle({
		color: { h: dominant.hue, s: ACCENT_SATURATION, l: ACCENT_LIGHTNESS },
		keepLight: true,
	})
	const tint = new THREE.Color().setHSL(
		toned.h / 360,
		toned.s,
		toned.l,
		THREE.SRGBColorSpace,
	)
	return [colors[0], colors[1], `#${tint.getHexString(THREE.SRGBColorSpace)}`]
}

function fit({ unit, degrees }: PaletteFitParams): PaletteColors {
	if (degrees === null)
		return tintAccent(PALETTES[Math.floor(unit * PALETTES.length)])
	const options = PALETTES.filter(analogous)
		.map((palette) => {
			const delta = signedGap({ from: primaryHue(palette), to: degrees })
			return { delta, colors: arrange(rotate({ palette, delta })) }
		})
		.filter((option) => !clashes(option.colors) && !pastelField(option.colors))
	const near = options.filter(
		(option) => Math.abs(option.delta) <= ROTATION_REACH,
	)
	const pool =
		near.length > 0
			? near
			: [
					options.reduce((best, option) =>
						Math.abs(option.delta) < Math.abs(best.delta) ? option : best,
					),
				]
	return tintAccent(pool[Math.floor(unit * pool.length)].colors)
}

export const PALETTE = { fit }
