import { EMB_CONSTANTS } from "./constants"

/* eslint-disable camelcase */

/**
 * Static (temperature-independent) polar albedo boost representing
 * permanent, non-seasonal polar ice on a low-obliquity world -- unlike the
 * old ice-albedo feedback (removed, see git history / luna-repro), this
 * depends only on latitude and obliquity, never on temperature, so it can't
 * reintroduce the temperature-threshold discontinuity that feedback caused.
 *
 * obliquityFactor -> 1 at/above Earth's 23.5deg tilt (no boost), -> 0 as tilt
 * -> 0 (full boost at the poles). POLAR_ALBEDO_BOOST_MAX is the tunable
 * coefficient: the max additional albedo applied exactly at the poles for a
 * 0-obliquity world; it scales linearly to 0 at the equator and at
 * Earth-like obliquity.
 */
const POLAR_ALBEDO_BOOST_MAX = 0.08

function polarAlbedoBoost(latDeg: number, obliquityDeg: number): number {
	const obliquityFactor = Math.min(1, Math.max(0, obliquityDeg) / 23.5)
	const latitudeFactor = Math.abs(latDeg) / 90
	return POLAR_ALBEDO_BOOST_MAX * (1 - obliquityFactor) * latitudeFactor
}

/**
 * Grid-independent approximation of polarAlbedoBoost's mean across all
 * latitudes -- the mean of |latDeg|/90 over a uniform -90..90 spread is 0.5,
 * so this is just polarAlbedoBoost's formula with that constant baked in.
 * Used where the actual per-latitude grid isn't built yet (see
 * computeGreenhouseOLR's linearization point, which runs before initModel
 * constructs lats_deg).
 */
export function meanPolarAlbedoBoost(obliquityDeg: number): number {
	const obliquityFactor = Math.min(1, Math.max(0, obliquityDeg) / 23.5)
	return POLAR_ALBEDO_BOOST_MAX * (1 - obliquityFactor) * 0.5
}

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

		for (let i = 0; i < EMB_CONSTANTS.grid.NUM_LAT; i++) {
			// Ice-albedo feedback (temperature-threshold based) temporarily
			// disabled -- see luna-repro discussion. The static polar boost below
			// is latitude/obliquity-only and unaffected by that bug.
			albedo[i][time] =
				(baseAlbedo ?? surface.ALBEDO.BASE) +
				polarAlbedoBoost(lats_deg[i], orbital.OBLIQUITY)
		}
	},
}
