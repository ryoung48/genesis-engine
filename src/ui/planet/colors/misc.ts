import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import { COLOR_PALETTES } from "@/model/shared/color/color-palettes"

/** Light blue used for ocean on thematic maps (non-terrain modes). */
export const OCEAN_LIGHT_BLUE: [number, number, number] = [0.75, 0.88, 0.96]

export function daylightColor(hours: number): [number, number, number] {
	const normalized = Math.max(0, Math.min(1, 1 - hours / 24))
	return COLOR_INTERPOLATION.quantizeRgb(
		COLOR_INTERPOLATION.sampleColorStops({
			stops: COLOR_PALETTES.purplesStops,
			t: normalized,
		}),
	)
}

export function climateZoneColor(zoneCode: number): [number, number, number] {
	return climateZoneColors[zoneCode] ?? climateZoneColors[0]
}

export function oceanCurrentColor(warmth: number): [number, number, number] {
	const clamped = Math.max(-1, Math.min(1, warmth))
	for (let i = 0; i < oceanCurrentStops.length - 1; i++) {
		const a = oceanCurrentStops[i]
		const b = oceanCurrentStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = oceanCurrentStops[oceanCurrentStops.length - 1]
	return [last.r, last.g, last.b]
}

export function midpoint(a: number, b: number): number {
	return (a + b) / 2
}

const climateZoneColors: [number, number, number][] = [
	OCEAN_LIGHT_BLUE,
	[0xd3 / 255, 0xef / 255, 0xff / 255],
	[0x7f / 255, 0xd0 / 255, 0xff / 255],
	[0x91 / 255, 0xff / 255, 0xdc / 255],
	[0xe6 / 255, 0xf5 / 255, 0x98 / 255],
	[0xff / 255, 0xa7 / 255, 0x5b / 255],
	[0xff / 255, 0x77 / 255, 0x85 / 255],
	[0x7e / 255, 0x43 / 255, 0x49 / 255],
	[0xc2 / 255, 0x93 / 255, 0xff / 255],
]

/**
 * Diverging warm/cold ocean current color ramp.
 * -1 (cold, deep blue) → 0 (white, weak/neutral) → +1 (warm, deep red).
 */
const oceanCurrentStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -1.0, r: 0.1, g: 0.2, b: 0.7 },
	{ v: -0.5, r: 0.3, g: 0.55, b: 0.9 },
	{ v: -0.1, r: 0.8, g: 0.9, b: 1.0 },
	{ v: 0.0, r: 1.0, g: 1.0, b: 1.0 },
	{ v: 0.1, r: 1.0, g: 0.85, b: 0.75 },
	{ v: 0.5, r: 0.95, g: 0.35, b: 0.2 },
	{ v: 1.0, r: 0.6, g: 0.08, b: 0.05 },
]
