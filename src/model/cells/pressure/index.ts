import { mean } from "d3"
import { PROVINCE } from "@/model/provinces"
import { MATH } from "@/model/utilities/math"
import { TEMPERATURE } from "../temperature"
import { Cell } from "../types"

export const PRESSURE_CONSTANTS = {
	P0: 1013.25, // Mean surface pressure [hPa]
}

const _monthlyCache = new Map<string, number>()

export const PRESSURE = {
	monthly: (cell: Cell, month: number): number => {
		const cacheKey = `${cell.idx}-${month}`
		if (_monthlyCache.has(cacheKey)) return _monthlyCache.get(cacheKey)!

		const { P0 } = PRESSURE_CONSTANTS

		const lat = cell.y

		// 1. Latitudinal circulation: 3 cells per hemisphere
		//    cos(3θ) where θ goes from 0 at equator to π/2 at pole
		//    gives pressure highs at ~30° and poles, low at equator and ~60°
		const absLat = Math.abs(lat)
		const latRad = MATH.conversion.angles.radians(lat)
		const hadleyWeight = Math.exp(-Math.pow((absLat - 15) / 20, 2))
		const ferrelWeight = Math.exp(-Math.pow((absLat - 45) / 18, 2)) * 0.85
		const amplitude = 8 * Math.max(hadleyWeight, ferrelWeight) + 0.8
		const P_lat = -amplitude * Math.cos(6 * latRad)

		// 2. Thermal pressure: warm anomaly → lower surface pressure
		const cellTemp = TEMPERATURE.monthly.mean({ cell, month })
		const latMean = TEMPERATURE.monthly.mean({ cell, month })
		const dT = cellTemp - latMean
		const P_thermal = -dT * 1.5

		const result = P0 + P_lat + P_thermal
		_monthlyCache.set(cacheKey, result)

		return result
	},
	global: {
		/** Calculates stats over all cells for the given month */
		_getValues: (month: number) => {
			return window.world.provinces.map((p) =>
				PRESSURE.monthly(PROVINCE.cell(p), month),
			)
		},
		mean: (month: number) => mean(PRESSURE.global._getValues(month)) ?? 1013.25,
		max: (month: number) => Math.max(...PRESSURE.global._getValues(month)),
		min: (month: number) => Math.min(...PRESSURE.global._getValues(month)),
	},
	clearCache: () => {
		_monthlyCache.clear()
	},
}
