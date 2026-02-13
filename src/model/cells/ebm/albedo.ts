import { scaleLinear } from "d3"

import { EMB_CONSTANTS } from "./constants"

/* eslint-disable camelcase */
export const ALBEDO = {
	landFraction: () => {
		const _land_fraction: number[] = new Array(36).fill(0.3)
		const latScale = scaleLinear()
			.domain([0, EMB_CONSTANTS.grid.NUM_LAT])
			.range([-90, 90])
		const latRange = Array.from(
			{ length: EMB_CONSTANTS.grid.NUM_LAT },
			(_, i) => latScale(i),
		).reverse()
		const buckets = Array.from({ length: EMB_CONSTANTS.grid.NUM_LAT }, () => ({
			land: 0,
			water: 0,
		}))
		window.world.cells.forEach((cell) => {
			const y = Math.max(-90, cell.y)
			const index = latRange.findIndex((lat) => y >= lat)
			if (cell.isWater) buckets[index].water += 1
			else buckets[index].land += 1
		})
		buckets.reverse().forEach(({ land, water }, i) => {
			const total = land + water
			_land_fraction[i] = Math.min(total > 0 ? land / total : 0, 0.8)
		})
		return _land_fraction
	},
	update: (params: {
		albedo: number[][]
		lats_deg: number[]
		temperature: number[][]
		land_fraction: number[]
		time: number
		orbital: typeof EMB_CONSTANTS.orbital
	}): void => {
		const { albedo, lats_deg, temperature, land_fraction, time, orbital } =
			params
		const { surface } = EMB_CONSTANTS
		const obliquityFactor = Math.max(
			0.1,
			Math.min(1, orbital.OBLIQUITY / 23.5) ** 0.5,
		) // Normalize to Earth's obliquity
		// Ice limit becomes more extreme at lower latitudes with lower obliquity
		const effectiveIceLimit =
			EMB_CONSTANTS.thermal.ICE_LIMIT + (1 - obliquityFactor) * 5 // Adjust ice formation threshold

		for (let i = 0; i < EMB_CONSTANTS.grid.NUM_LAT; i++) {
			const latitudeEffect = Math.abs(lats_deg[i]) / 90 // 0 at equator, 1 at poles
			// At low obliquity, ice forms more readily at high latitudes
			const localIceLimit =
				effectiveIceLimit + latitudeEffect * (1 - obliquityFactor) * 10

			if (temperature[i][time] < localIceLimit) {
				const sensitivity = Math.min(1, orbital.OBLIQUITY / 35)
				albedo[i][time] = surface.ALBEDO.ICE - sensitivity * 0.2
			} else {
				albedo[i][time] =
					surface.ALBEDO.OCEAN * (1 - land_fraction[i]) +
					surface.ALBEDO.LAND * land_fraction[i]
			}
		}
	},
}
