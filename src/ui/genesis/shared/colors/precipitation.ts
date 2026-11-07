export function interpolatePrecipitationStops(
	mm: number,
	stops: ReadonlyArray<{ mm: number; r: number; g: number; b: number }>,
): [number, number, number] {
	for (let i = 0; i < stops.length - 1; i++) {
		const a = stops[i]
		const b = stops[i + 1]
		if (mm <= b.mm) {
			const t = (mm - a.mm) / (b.mm - a.mm)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = stops[stops.length - 1]
	return [last.r, last.g, last.b]
}

export function precipitationMonthlyColor(
	mm: number,
): [number, number, number] {
	return interpolatePrecipitationStops(mm, monthlyPrecipStops)
}

export function precipitationAnnualColor(mm: number): [number, number, number] {
	return interpolatePrecipitationStops(mm, annualPrecipStops)
}

export function precipitationColor(mm: number): [number, number, number] {
	return precipitationMonthlyColor(mm)
}

export function precipitationDifferenceColor(
	diffMm: number,
): [number, number, number] {
	const clamped = Math.max(
		precipDiffStops[0].v,
		Math.min(precipDiffStops[precipDiffStops.length - 1].v, diffMm),
	)
	for (let i = 0; i < precipDiffStops.length - 1; i++) {
		const a = precipDiffStops[i]
		const b = precipDiffStops[i + 1]
		if (clamped <= b.v) {
			const t = (clamped - a.v) / (b.v - a.v)
			return [
				a.r + t * (b.r - a.r),
				a.g + t * (b.g - a.g),
				a.b + t * (b.b - a.b),
			]
		}
	}
	const last = precipDiffStops[precipDiffStops.length - 1]
	return [last.r, last.g, last.b]
}

const monthlyPrecipStops: { mm: number; r: number; g: number; b: number }[] = [
	{ mm: 0, r: 0.76, g: 0.7, b: 0.5 },
	{ mm: 10, r: 0.85, g: 0.78, b: 0.45 },
	{ mm: 40, r: 0.7, g: 0.82, b: 0.42 },
	{ mm: 83, r: 0.4, g: 0.75, b: 0.45 },
	{ mm: 125, r: 0.2, g: 0.65, b: 0.55 },
	{ mm: 165, r: 0.15, g: 0.5, b: 0.7 },
	{ mm: 250, r: 0.15, g: 0.3, b: 0.8 },
	{ mm: 400, r: 0.3, g: 0.15, b: 0.7 },
]

const annualPrecipStops = monthlyPrecipStops.map((stop) => ({
	...stop,
	mm: stop.mm * 12,
}))

const precipDiffStops: { v: number; r: number; g: number; b: number }[] = [
	{ v: -200, r: 0.35, g: 0.16, b: 0.06 },
	{ v: -100, r: 0.79, g: 0.46, b: 0.18 },
	{ v: -25, r: 0.96, g: 0.86, b: 0.62 },
	{ v: 0, r: 0.98, g: 0.97, b: 0.95 },
	{ v: 25, r: 0.76, g: 0.9, b: 0.78 },
	{ v: 100, r: 0.23, g: 0.63, b: 0.69 },
	{ v: 200, r: 0.08, g: 0.28, b: 0.48 },
]
