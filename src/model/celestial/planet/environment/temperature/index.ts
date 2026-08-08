import type {
	DeviationInput,
	OrbitalTemperatureInput,
	TemperatureInput,
} from "@/model/celestial/planet/environment/temperature/types"
import type { Zone } from "@/model/celestial/planet/types"

const DEVIATION_DOMAIN = [
	-4.5, -4.0, -4.0, -3.5, -3.5, -3.0, -3.0, -2.5, -2.5, -2.0, -2.0, -1.5, -1.5,
	-1.0, -1.0, -0.5, -0.5, 0.5, 0.5, 1.0, 1.0, 1.5, 1.5, 2.0, 2.0, 2.5,
] as const
// The two breakpoints straddling deviation 0 (indices 16/17, at -0.5/0.5)
// were 5/25 -- interpolating to 15C at deviation 0 exactly. But
// auFromTemperature/celsiusForOrbitalDistance's blackbody formula only
// resolves deviation 0 back to exactly 1 AU (at luminositySol 1) for a
// 279K/5.85C target (279 being that formula's own equilibrium constant), not
// Earth's real warmed 15C surface temp. Recentered on 5.85C (keeping the
// same 20-wide spread the original 5/25 pair had) so a forced main world at
// the habitable-zone center actually lands at 1 AU around a Sol-like star.
const DEVIATION_RANGE = [
	-250, -230, -210, -190, -180, -160, -150, -130, -120, -100, -95, -75, -65,
	-50, -40, 0, -4.15, 15.85, 35, 75, 85, 180, 200, 300, 350, 450,
] as const
function deviationToCelsius(deviation: number): number {
	if (deviation <= DEVIATION_DOMAIN[0]) return DEVIATION_RANGE[0]
	const lastIndex = DEVIATION_DOMAIN.length - 1
	if (deviation >= DEVIATION_DOMAIN[lastIndex])
		return DEVIATION_RANGE[lastIndex]
	for (let i = 0; i < lastIndex; i++) {
		const x0 = DEVIATION_DOMAIN[i]
		const x1 = DEVIATION_DOMAIN[i + 1]
		if (deviation >= x0 && deviation <= x1) {
			if (x1 === x0) return DEVIATION_RANGE[i + 1]
			const t = (deviation - x0) / (x1 - x0)
			return (
				DEVIATION_RANGE[i] + t * (DEVIATION_RANGE[i + 1] - DEVIATION_RANGE[i])
			)
		}
	}
	return DEVIATION_RANGE[lastIndex]
}

function celsiusForOrbitalDistance({
	orbitalDistanceAU,
	luminositySol,
}: OrbitalTemperatureInput): number {
	return 279 * (luminositySol / orbitalDistanceAU ** 2) ** 0.25 - 273.15
}

function auFromTemperature({
	kelvinTemp,
	luminositySol,
}: TemperatureInput): number {
	return (luminositySol / (kelvinTemp / 279) ** 4) ** 0.5
}

function deviationToAU({ deviation, luminositySol }: DeviationInput): number {
	return auFromTemperature({
		kelvinTemp: deviationToCelsius(deviation) + 273.15,
		luminositySol,
	})
}

function estimateDeviationFromOrbitalDistance({
	orbitalDistanceAU,
	luminositySol,
}: OrbitalTemperatureInput): number {
	const targetCelsius = celsiusForOrbitalDistance({
		orbitalDistanceAU,
		luminositySol,
	})
	let closestDeviation = 0
	let closestDelta = Number.POSITIVE_INFINITY
	for (let step = -45; step <= 25; step++) {
		const deviation = step / 10
		const delta = Math.abs(deviationToCelsius(deviation) - targetCelsius)
		if (delta < closestDelta) {
			closestDelta = delta
			closestDeviation = deviation
		}
	}
	return closestDeviation
}

function zoneFromDeviation(deviation: number): Zone {
	if (deviation >= 1) return "epistellar"
	if (deviation <= -1) return "outer"
	return "inner"
}

export const TEMPERATURE = {
	deviationToCelsius,
	auFromTemperature,
	deviationToAU,
	estimateDeviationFromOrbitalDistance,
	zoneFromDeviation,
}
