export function inferRetrogradeRotationFromAxialTiltDeg(
	axialTiltDeg: number,
): boolean {
	return axialTiltDeg > 90
}

export function computeSolarDayHours(params: {
	siderealDayHours: number
	orbitalPeriodDays: number
	retrograde?: boolean
}): number | null {
	const { siderealDayHours, orbitalPeriodDays, retrograde = false } = params
	if (!(siderealDayHours > 0) || !(orbitalPeriodDays > 0)) return null

	const siderealCyclesPerHour = 1 / siderealDayHours
	const orbitalCyclesPerHour = 1 / (orbitalPeriodDays * 24)
	const solarCyclesPerHour = retrograde
		? siderealCyclesPerHour + orbitalCyclesPerHour
		: siderealCyclesPerHour - orbitalCyclesPerHour

	if (Math.abs(solarCyclesPerHour) < 1e-9) return Number.POSITIVE_INFINITY
	if (solarCyclesPerHour <= 0) return Number.POSITIVE_INFINITY

	return 1 / solarCyclesPerHour
}
