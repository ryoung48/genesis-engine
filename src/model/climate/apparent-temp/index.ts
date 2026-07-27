import type { ApparentTemperatureParams } from "@/model/climate/apparent-temp/types"

function heatIndexF({ tF, rh }: { tF: number; rh: number }): number {
	return (
		-42.379 +
		2.04901523 * tF +
		10.14333127 * rh -
		0.22475541 * tF * rh -
		0.00683783 * tF * tF -
		0.05481717 * rh * rh +
		0.00122874 * tF * tF * rh +
		0.00085282 * tF * rh * rh -
		0.00000199 * tF * tF * rh * rh
	)
}

function windChillC({ tempC, vKmh }: { tempC: number; vKmh: number }): number {
	const v16 = Math.pow(vKmh, 0.16)
	return 13.12 + 0.6215 * tempC - 11.37 * v16 + 0.3965 * tempC * v16
}

function apparentTemperatureC({
	tempC,
	rhPercent,
	windSpeedMs,
}: ApparentTemperatureParams): number {
	if (tempC >= 27) {
		const tF = tempC * 1.8 + 32
		return Math.max(tempC, (heatIndexF({ tF, rh: rhPercent }) - 32) / 1.8)
	}

	const vKmh = windSpeedMs * 3.6
	const wc = vKmh >= 5 ? windChillC({ tempC, vKmh }) : tempC

	if (tempC <= 10) return wc

	// Blend: full wind chill at 10 °C → actual temperature at 27 °C
	const t = (tempC - 10) / 17
	return wc + (tempC - wc) * t
}

export const APPARENT_TEMP = {
	apparentTemperatureC,
}
