import { EMB_CONSTANTS } from "./constants"

/* eslint-disable camelcase */
export const ALBEDO = {
	landFraction: () => {
		return Array.from({ length: EMB_CONSTANTS.grid.NUM_LAT }, (_, i) => {
			const lat = Math.abs(
				(-90 + (180 * i) / EMB_CONSTANTS.grid.NUM_LAT) as number,
			)
			return lat < 20 ? 0.35 : lat < 55 ? 0.3 : 0.2
		})
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
		)
		const effectiveIceLimit =
			EMB_CONSTANTS.thermal.ICE_LIMIT + (1 - obliquityFactor) * 5

		for (let i = 0; i < EMB_CONSTANTS.grid.NUM_LAT; i++) {
			const latitudeEffect = Math.abs(lats_deg[i]) / 90
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
