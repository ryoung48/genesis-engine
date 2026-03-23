/**
 * Orogen elevation and temperature color mapping.
 */

export type ColorMode = "terrain" | "heightmap" | "landHeightmap" | "temperature" | "biotemperature" | "precipitation" | "vegetation" | "climate" | "pastaClimate" | "koppenClimate" | "oceanCurrents" | "windSpeed"

const oceanColorStops: [number, number, number][] = [
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

const landColorStops: [number, number, number][] = [
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

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t
}

/**
 * Convert raw mesh elevation to physical height in km.
 * Hybrid S-curve: quartic start gives flatlands, steepest near 0.75, derivative -> 0 at top.
 * Ocean mapped linearly (~5 km at -0.5).
 */
export function elevToHeightKm(elev: number): number {
	if (elev <= 0) return elev * 10
	const t = Math.min(elev, 1)
	const t2 = t * t
	return 6 * t2 * t2 * (5 - 4 * t)
}

/**
 * Terrain color ramp using the shared world metrics palette for land,
 * while keeping the existing ocean palette.
 */
export function elevationToColor(e: number): [number, number, number] {
	const km = elevToHeightKm(e)

	if (km <= 0) {
		const t = 1 - Math.max(0, Math.min(1, (km + 5) / 5))
		const scaled = t * (oceanColorStops.length - 1)
		const i = Math.min(oceanColorStops.length - 2, Math.floor(scaled))
		const localT = scaled - i
		const a = oceanColorStops[i]
		const b = oceanColorStops[i + 1]
		return [
			lerp(a[0], b[0], localT),
			lerp(a[1], b[1], localT),
			lerp(a[2], b[2], localT),
		]
	}

	const t = Math.max(0, Math.min(1, km / 6))
	const scaled = t * (landColorStops.length - 1)
	const i = Math.min(landColorStops.length - 2, Math.floor(scaled))
	const localT = scaled - i
	const a = landColorStops[i]
	const b = landColorStops[i + 1]
	return [
		lerp(a[0], b[0], localT),
		lerp(a[1], b[1], localT),
		lerp(a[2], b[2], localT),
	]
}

/**
 * Grayscale heightmap: fixed range -5 km -> 6 km.
 * Same physical height always maps to the same shade.
 */
export function heightmapColor(elevation: number): [number, number, number] {
	const h = elevToHeightKm(elevation)
	const t = Math.max(0, Math.min(1, (h + 5) / 11))
	return [t, t, t]
}

/**
 * Land heightmap: ocean = black, land on 0 -> 6 km scale.
 */
export function landHeightmapColor(elevation: number): [number, number, number] {
	if (elevation <= 0) return [0, 0, 0]
	const t = Math.max(0, Math.min(1, elevToHeightKm(elevation) / 6))
	return [t, t, t]
}

const tempStops: { c: number; r: number; g: number; b: number }[] = [
	{ c: -73, r: 0.973, g: 0.984, b: 1.0 },
	{ c: -51.11, r: 0.863, g: 0.933, b: 0.98 },
	{ c: -40, r: 0.639, g: 0.761, b: 0.902 },
	{ c: -28.89, r: 0.549, g: 0.714, b: 0.847 },
	{ c: -17.78, r: 0.392, g: 0.584, b: 0.804 },
	{ c: 0, r: 0.18, g: 0.349, b: 0.518 },
	{ c: 4.44, r: 0.231, g: 0.62, b: 0.749 },
	{ c: 10, r: 0.416, g: 0.804, b: 0.847 },
	{ c: 15.56, r: 0.608, g: 0.835, b: 0.624 },
	{ c: 21.11, r: 0.824, g: 0.902, b: 0.498 },
	{ c: 23.89, r: 0.945, g: 0.894, b: 0.494 },
	{ c: 26.67, r: 0.941, g: 0.776, b: 0.435 },
	{ c: 29.44, r: 0.949, g: 0.631, b: 0.369 },
	{ c: 32.22, r: 0.957, g: 0.608, b: 0.259 },
	{ c: 35, r: 0.937, g: 0.49, b: 0.231 },
	{ c: 37.78, r: 0.882, g: 0.361, b: 0.31 },
	{ c: 40.56, r: 0.839, g: 0.286, b: 0.392 },
	{ c: 43.33, r: 0.729, g: 0.184, b: 0.427 },
	{ c: 46.11, r: 0.639, g: 0.082, b: 0.388 },
	{ c: 48.89, r: 0.49, g: 0.0, b: 0.31 },
	{ c: 80, r: 0.353, g: 0.0, b: 0.184 },
]

export function temperatureColor(celsius: number): [number, number, number] {
	const clamped = Math.max(
		tempStops[0].c,
		Math.min(tempStops[tempStops.length - 1].c, celsius),
	)
	for (let i = 0; i < tempStops.length - 1; i++) {
		const a = tempStops[i]
		const b = tempStops[i + 1]
		if (clamped <= b.c) {
			const t = (clamped - a.c) / (b.c - a.c)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = tempStops[tempStops.length - 1]
	return [last.r, last.g, last.b]
}

/**
 * Precipitation color ramp: tan (dry) -> green -> teal -> blue -> purple (wet).
 * Input: monthly mm (0-250+) or annual mm (0-3000+).
 */
const precipStops: { mm: number; r: number; g: number; b: number }[] = [
	{ mm: 0, r: 0.76, g: 0.70, b: 0.50 },
	{ mm: 10, r: 0.85, g: 0.78, b: 0.45 },
	{ mm: 40, r: 0.70, g: 0.82, b: 0.42 },
	{ mm: 83, r: 0.40, g: 0.75, b: 0.45 },
	{ mm: 125, r: 0.20, g: 0.65, b: 0.55 },
	{ mm: 165, r: 0.15, g: 0.50, b: 0.70 },
	{ mm: 250, r: 0.15, g: 0.30, b: 0.80 },
	{ mm: 400, r: 0.30, g: 0.15, b: 0.70 },
]

export function precipitationColor(mm: number): [number, number, number] {
	const clamped = Math.max(precipStops[0].mm, Math.min(precipStops[precipStops.length - 1].mm, mm))
	for (let i = 0; i < precipStops.length - 1; i++) {
		const a = precipStops[i]
		const b = precipStops[i + 1]
		if (clamped <= b.mm) {
			const t = (clamped - a.mm) / (b.mm - a.mm)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = precipStops[precipStops.length - 1]
	return [last.r, last.g, last.b]
}

const climateZoneColors: [number, number, number][] = [
	[0.05, 0.08, 0.18],
	[0xd3 / 255, 0xef / 255, 0xff / 255],
	[0x7f / 255, 0xd0 / 255, 0xff / 255],
	[0x91 / 255, 0xff / 255, 0xdc / 255],
	[0xe6 / 255, 0xf5 / 255, 0x98 / 255],
	[0xff / 255, 0xa7 / 255, 0x5b / 255],
	[0xff / 255, 0x77 / 255, 0x85 / 255],
	[0x7e / 255, 0x43 / 255, 0x49 / 255],
	[0xc2 / 255, 0x93 / 255, 0xff / 255],
]

export function climateZoneColor(zoneCode: number): [number, number, number] {
	return climateZoneColors[zoneCode] ?? climateZoneColors[0]
}

/**
 * Continuous climate color ramp by mean temperature.
 * Matches MAP_METRICS.climate.tempColor from shapes/metrics.ts.
 */
const climateTempStops: { t: number; r: number; g: number; b: number }[] = [
	{ t: -10, r: 0xd3 / 255, g: 0xef / 255, b: 0xff / 255 },
	{ t: -5, r: 0x7f / 255, g: 0xd0 / 255, b: 0xff / 255 },
	{ t: 4, r: 0x91 / 255, g: 0xff / 255, b: 0xdc / 255 },
	{ t: 10, r: 0xe6 / 255, g: 0xf5 / 255, b: 0x98 / 255 },
	{ t: 20, r: 0xff / 255, g: 0xa7 / 255, b: 0x5b / 255 },
	{ t: 30, r: 0xff / 255, g: 0x77 / 255, b: 0x85 / 255 },
	{ t: 40, r: 0x7e / 255, g: 0x43 / 255, b: 0x49 / 255 },
]

export function climateTempColor(celsius: number): [number, number, number] {
	const clamped = Math.max(climateTempStops[0].t, Math.min(climateTempStops[climateTempStops.length - 1].t, celsius))
	for (let i = 0; i < climateTempStops.length - 1; i++) {
		const a = climateTempStops[i]
		const b = climateTempStops[i + 1]
		if (clamped <= b.t) {
			const f = (clamped - a.t) / (b.t - a.t)
			return [
				a.r + f * (b.r - a.r),
				a.g + f * (b.g - a.g),
				a.b + f * (b.b - a.b),
			]
		}
	}
	const last = climateTempStops[climateTempStops.length - 1]
	return [last.r, last.g, last.b]
}

const biomeColors: [number, number, number][] = [
	[0.05, 0.08, 0.18],
	[0xe8 / 255, 0xcc / 255, 0xa7 / 255],
	[0xb9 / 255, 0xbc / 255, 0x91 / 255],
	[0x9d / 255, 0xb4 / 255, 0x7b / 255],
	[0x7d / 255, 0x8c / 255, 0x5c / 255],
	[0x4d / 255, 0x61 / 255, 0x3c / 255],
	[0x2d / 255, 0x4d / 255, 0x29 / 255],
]

export function vegetationColor(biomeCode: number): [number, number, number] {
	return biomeColors[biomeCode] ?? biomeColors[0]
}

/**
 * Diverging warm/cold ocean current color ramp.
 * -1 (cold, deep blue) → 0 (neutral gray) → +1 (warm, deep red/orange).
 */
const oceanCurrentStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -1.0, r: 0.12, g: 0.15, b: 0.60 },
	{ v: -0.5, r: 0.20, g: 0.45, b: 0.80 },
	{ v: -0.15, r: 0.55, g: 0.75, b: 0.90 },
	{ v:  0.0, r: 0.80, g: 0.80, b: 0.80 },
	{ v:  0.15, r: 0.95, g: 0.70, b: 0.50 },
	{ v:  0.5, r: 0.90, g: 0.40, b: 0.20 },
	{ v:  1.0, r: 0.65, g: 0.12, b: 0.08 },
]

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

/**
 * Wind speed color ramp: light gray-green (calm) → saturated cyan-teal (fast).
 * Input: raw wind speed in m/s, clamped to a fixed 0–20 m/s display range.
 */
const windSpeedStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: 0.0, r: 0xe8 / 255, g: 0xef / 255, b: 0xec / 255 },
	{ v: 0.1, r: 0xd6 / 255, g: 0xe6 / 255, b: 0xe0 / 255 },
	{ v: 0.2, r: 0xc4 / 255, g: 0xdd / 255, b: 0xd6 / 255 },
	{ v: 0.3, r: 0xae / 255, g: 0xe0 / 255, b: 0xd6 / 255 },
	{ v: 0.4, r: 0x8f / 255, g: 0xde / 255, b: 0xd5 / 255 },
	{ v: 0.5, r: 0x6f / 255, g: 0xd9 / 255, b: 0xd3 / 255 },
	{ v: 0.6, r: 0x4f / 255, g: 0xd4 / 255, b: 0xd1 / 255 },
	{ v: 0.7, r: 0x33 / 255, g: 0xcd / 255, b: 0xcf / 255 },
	{ v: 0.8, r: 0x1f / 255, g: 0xc5 / 255, b: 0xcb / 255 },
	{ v: 0.9, r: 0x10 / 255, g: 0xbc / 255, b: 0xc6 / 255 },
	{ v: 1.0, r: 0x06 / 255, g: 0xb3 / 255, b: 0xc0 / 255 },
]

export function windSpeedColor(speed: number): [number, number, number] {
	const clamped = Math.max(0, Math.min(1, speed / 20))
	for (let i = 0; i < windSpeedStops.length - 1; i++) {
		const a = windSpeedStops[i]
		const b = windSpeedStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [a.r + t * (b.r - a.r), a.g + t * (b.g - a.g), a.b + t * (b.b - a.b)]
		}
	}
	const last = windSpeedStops[windSpeedStops.length - 1]
	return [last.r, last.g, last.b]
}

export function getColor(elev: number, mode: ColorMode): [number, number, number] {
	switch (mode) {
		case "heightmap":
			return heightmapColor(elev)
		case "landHeightmap":
			return landHeightmapColor(elev)
		default:
			return elevationToColor(elev)
	}
}
