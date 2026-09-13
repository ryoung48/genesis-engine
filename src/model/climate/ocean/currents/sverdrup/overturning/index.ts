import type {
	OverturningCell,
	TemperatureDrivenOverturningParams,
} from "@/model/climate/ocean/currents/sverdrup/overturning/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const DEG2RAD = Math.PI / 180

function temperatureDriven({
	ocean,
	temperatureC,
	planet,
	turnoverSeconds,
}: TemperatureDrivenOverturningParams): OverturningCell {
	if (turnoverSeconds <= 0) throw new Error("Overturning time must be positive")
	let sum = 0
	let count = 0
	for (let idx = 0; idx < CELLS; idx++) {
		if (!ocean[idx] || !Number.isFinite(temperatureC[idx])) continue
		sum += temperatureC[idx]
		count++
	}
	const meanC = count > 0 ? sum / count : 0
	let variance = 0
	for (let idx = 0; idx < CELLS; idx++) {
		if (!ocean[idx] || !Number.isFinite(temperatureC[idx])) continue
		variance += (temperatureC[idx] - meanC) ** 2
	}
	const temperatureScaleC = Math.max(
		Math.sqrt(variance / Math.max(1, count)),
		1,
	)
	const transportCoefficientM2S = planet.radiusM ** 2 / turnoverSeconds
	const metersPerDeg = planet.radiusM * DEG2RAD
	const upperX = new Float32Array(CELLS)
	const upperY = new Float32Array(CELLS)
	const deepX = new Float32Array(CELLS)
	const deepY = new Float32Array(CELLS)
	let maxUpperSpeedMps = 0
	const at = (idx: number, fallback: number) =>
		ocean[idx] && Number.isFinite(temperatureC[idx])
			? temperatureC[idx]
			: fallback
	for (let j = 1; j < H - 1; j++) {
		const base = j * W
		const dx = metersPerDeg * SVERDRUP_RASTER.rowCos[j]
		for (let i = 0; i < W; i++) {
			const idx = base + i
			if (!ocean[idx]) continue
			const local = temperatureC[idx]
			const west = at(base + SVERDRUP_RASTER.wrapColumn(i - 1), local)
			const east = at(base + SVERDRUP_RASTER.wrapColumn(i + 1), local)
			const south = at(idx - W, local)
			const north = at(idx + W, local)
			upperX[idx] =
				(-transportCoefficientM2S * (east - west)) /
				(2 * dx * temperatureScaleC)
			upperY[idx] =
				(-transportCoefficientM2S * (north - south)) /
				(2 * metersPerDeg * temperatureScaleC)
			deepX[idx] = -upperX[idx]
			deepY[idx] = -upperY[idx]
			maxUpperSpeedMps = Math.max(
				maxUpperSpeedMps,
				Math.hypot(upperX[idx], upperY[idx]),
			)
		}
	}
	return {
		upperLimb: { x: upperX, y: upperY },
		deepReturn: { x: deepX, y: deepY },
		maxUpperSpeedMps,
	}
}

export const SVERDRUP_OVERTURNING = {
	temperatureDriven,
}
