import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"

const DENSITY_BINS: ReadonlyArray<{
	minPerKm2: number
	color: [number, number, number]
}> = [
	{ minPerKm2: 1, color: COLOR_INTERPOLATION.cssColorToRgb("#fbe15e") },
	{ minPerKm2: 6, color: COLOR_INTERPOLATION.cssColorToRgb("#fccb47") },
	{ minPerKm2: 11, color: COLOR_INTERPOLATION.cssColorToRgb("#f5ab30") },
	{ minPerKm2: 31, color: COLOR_INTERPOLATION.cssColorToRgb("#df8421") },
	{ minPerKm2: 51, color: COLOR_INTERPOLATION.cssColorToRgb("#a95524") },
	{ minPerKm2: 101, color: COLOR_INTERPOLATION.cssColorToRgb("#862e1a") },
	{ minPerKm2: 500, color: COLOR_INTERPOLATION.cssColorToRgb("#5a0f0d") },
]

export function populationDensityColor(
	densityPerKm2: number,
): [number, number, number] {
	if (densityPerKm2 < DENSITY_BINS[0].minPerKm2) {
		const t = Math.max(0, densityPerKm2) / DENSITY_BINS[0].minPerKm2
		const [r, g, b] = DENSITY_BINS[0].color
		return [1 + (r - 1) * t, 1 + (g - 1) * t, 1 + (b - 1) * t]
	}
	let color = DENSITY_BINS[0].color
	for (const bin of DENSITY_BINS) {
		if (densityPerKm2 < bin.minPerKm2) break
		color = bin.color
	}
	return color
}
