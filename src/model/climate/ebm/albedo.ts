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
		time: number
		orbital: typeof EMB_CONSTANTS.orbital
		/** Base (non-ice) Bond albedo -- a single value for the whole body.
		 * Overrides surface.ALBEDO.BASE (0.35, an Earth default). */
		baseAlbedo?: number
		/** Ice-cap albedo, used below the local ice threshold. Overrides
		 * surface.ALBEDO.ICE (0.65, an Earth default). */
		iceAlbedo?: number
	}): void => {
		const {
			albedo,
			lats_deg,
			temperature,
			time,
			orbital,
			baseAlbedo,
			iceAlbedo,
		} = params
		const { surface } = EMB_CONSTANTS
		void iceAlbedo
		void temperature
		void orbital
		void lats_deg

		for (let i = 0; i < EMB_CONSTANTS.grid.NUM_LAT; i++) {
			// Ice-albedo feedback temporarily disabled -- see luna-repro
			// discussion. Always use the base albedo, no ice/no-ice threshold.
			albedo[i][time] = baseAlbedo ?? surface.ALBEDO.BASE
		}
	},
}
