import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"
import type { RgbColor } from "@/model/shared/color/color-interpolation/types"

export function hex(rgb: number): [number, number, number] {
	return [
		((rgb >> 16) & 0xff) / 255,
		((rgb >> 8) & 0xff) / 255,
		(rgb & 0xff) / 255,
	]
}

/**
 * Terrain color ramp using the shared world metrics palette for land,
 * while keeping the existing ocean palette.
 * Accepts elevation in km (use elevation_km array, not raw).
 */
export function elevationToColor(
	km: number,
	maxElevKm = 6,
): [number, number, number] {
	if (km <= 0) {
		const t = 1 - Math.max(0, Math.min(1, (km + 5) / 5))
		return COLOR_INTERPOLATION.sampleColorStops({ stops: oceanColorStops, t })
	}

	const t = Math.max(0, Math.min(1, km / maxElevKm))
	return COLOR_INTERPOLATION.sampleColorStops({ stops: landColorStops, t })
}

/**
 * Grayscale terrain: ocean = black, land on 0 -> maxElev km scale.
 * Accepts elevation in km.
 */
export function grayscaleColor(
	km: number,
	maxElevKm = 6,
): [number, number, number] {
	if (km <= 0) return [0, 0, 0]
	const t = Math.max(0, Math.min(1, km / maxElevKm))
	return [t, t, t]
}

const oceanColorStops: RgbColor[] = [
	[0xd8 / 255, 0xf2 / 255, 0xfe / 255],
	[0xc6 / 255, 0xec / 255, 0xff / 255],
	[0xb9 / 255, 0xe3 / 255, 0xff / 255],
	[0xac / 255, 0xdb / 255, 0xfb / 255],
	[0xa1 / 255, 0xd2 / 255, 0xf7 / 255],
	[0x96 / 255, 0xc9 / 255, 0xf0 / 255],
	[0x8d / 255, 0xc1 / 255, 0xea / 255],
	[0x84 / 255, 0xb9 / 255, 0xe3 / 255],
	[0x79 / 255, 0xb2 / 255, 0xde / 255],
	[0x71 / 255, 0xab / 255, 0xd8 / 255],
]

const landColorStops: RgbColor[] = [
	[0xac / 255, 0xd0 / 255, 0xa5 / 255],
	[0x94 / 255, 0xbf / 255, 0x8b / 255],
	[0xa8 / 255, 0xc6 / 255, 0x8f / 255],
	[0xbd / 255, 0xcc / 255, 0x96 / 255],
	[0xd1 / 255, 0xd7 / 255, 0xab / 255],
	[0xe1 / 255, 0xe4 / 255, 0xb5 / 255],
	[0xef / 255, 0xeb / 255, 0xc0 / 255],
	[0xe8 / 255, 0xe1 / 255, 0xb6 / 255],
	[0xde / 255, 0xd6 / 255, 0xa3 / 255],
	[0xd3 / 255, 0xca / 255, 0x9d / 255],
	[0xca / 255, 0xb9 / 255, 0x82 / 255],
	[0xc3 / 255, 0xa7 / 255, 0x6b / 255],
	[0xb9 / 255, 0x98 / 255, 0x5a / 255],
	[0xaa / 255, 0x87 / 255, 0x53 / 255],
	[0xac / 255, 0x9a / 255, 0x7c / 255],
	[0xba / 255, 0xae / 255, 0x9a / 255],
	[0xca / 255, 0xc3 / 255, 0xb8 / 255],
	[0xe0 / 255, 0xde / 255, 0xd8 / 255],
	[0xf5 / 255, 0xf4 / 255, 0xf2 / 255],
]
