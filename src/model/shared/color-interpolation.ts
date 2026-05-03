import { clamp01 } from "./math"

export type RgbColor = [number, number, number]

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t
}

export function mixRgb(a: RgbColor, b: RgbColor, t: number): RgbColor {
	return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

export function rgbToCss([r, g, b]: RgbColor): string {
	return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

export function quantizeRgb([r, g, b]: RgbColor): RgbColor {
	return [
		Math.round(r * 255) / 255,
		Math.round(g * 255) / 255,
		Math.round(b * 255) / 255,
	]
}

export function cssColorToRgb(value: string): RgbColor {
	if (value.startsWith("#")) {
		const hex = value.slice(1)
		if (hex.length === 3) {
			return [
				parseInt(hex[0] + hex[0], 16) / 255,
				parseInt(hex[1] + hex[1], 16) / 255,
				parseInt(hex[2] + hex[2], 16) / 255,
			]
		}
		return [
			parseInt(hex.slice(0, 2), 16) / 255,
			parseInt(hex.slice(2, 4), 16) / 255,
			parseInt(hex.slice(4, 6), 16) / 255,
		]
	}

	const match = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
	if (!match) {
		throw new Error(`Unsupported color format: ${value}`)
	}
	return [
		Number(match[1]) / 255,
		Number(match[2]) / 255,
		Number(match[3]) / 255,
	]
}

export function mapLinear(
	value: number,
	domainStart: number,
	domainEnd: number,
	rangeStart: number,
	rangeEnd: number,
	clamp = false,
): number {
	if (domainStart === domainEnd) return rangeEnd
	const t = (value - domainStart) / (domainEnd - domainStart)
	const normalized = clamp ? clamp01(t) : t
	return lerp(rangeStart, rangeEnd, normalized)
}

export function sampleColorStops(
	stops: readonly RgbColor[],
	t: number,
): RgbColor {
	if (stops.length === 0) return [0, 0, 0]
	if (stops.length === 1) return [...stops[0]]
	const clamped = clamp01(t)
	const scaled = clamped * (stops.length - 1)
	const index = Math.min(stops.length - 2, Math.floor(scaled))
	return mixRgb(stops[index], stops[index + 1], scaled - index)
}

function basis(
	t: number,
	v0: number,
	v1: number,
	v2: number,
	v3: number,
): number {
	const t2 = t * t
	const t3 = t2 * t
	return (
		((1 - 3 * t + 3 * t2 - t3) * v0 +
			(4 - 6 * t2 + 3 * t3) * v1 +
			(1 + 3 * t + 3 * t2 - 3 * t3) * v2 +
			t3 * v3) /
		6
	)
}

export function sampleBasisColorStops(
	stops: readonly RgbColor[],
	t: number,
): RgbColor {
	if (stops.length === 0) return [0, 0, 0]
	if (stops.length === 1) return [...stops[0]]

	const n = stops.length - 1
	const clamped = clamp01(t)
	const raw = clamped * n
	const index = clamped >= 1 ? n - 1 : Math.floor(raw)
	const localT = raw - index
	const v1 = stops[index]
	const v2 = stops[index + 1]
	const v0 =
		index > 0
			? stops[index - 1]
			: ([2 * v1[0] - v2[0], 2 * v1[1] - v2[1], 2 * v1[2] - v2[2]] as RgbColor)
	const v3 =
		index < n - 1
			? stops[index + 2]
			: ([2 * v2[0] - v1[0], 2 * v2[1] - v1[1], 2 * v2[2] - v1[2]] as RgbColor)

	return [
		basis(localT, v0[0], v1[0], v2[0], v3[0]),
		basis(localT, v0[1], v1[1], v2[1], v3[1]),
		basis(localT, v0[2], v1[2], v2[2], v3[2]),
	]
}
