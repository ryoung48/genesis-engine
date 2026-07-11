import { EMB_CONSTANTS } from "./constants"

/* eslint-disable camelcase */

/**
 * Half-width (K) of the smooth ice/snow transition band centered on
 * EMB_CONSTANTS.thermal.ICE_LIMIT. Below (ICE_LIMIT - this), a cell is fully
 * at iceAlbedo; above (ICE_LIMIT + this), fully at baseAlbedo; in between it
 * ramps continuously. This width is a numerical-stability choice (wide
 * enough that a day-to-day temperature wiggle can't jump the whole band and
 * cause the old hard-threshold oscillation -- see luna-repro), not a fit to
 * any specific body's climatology.
 */
const ICE_TRANSITION_HALF_WIDTH_K = 8

function smoothstep(t: number): number {
	const clamped = Math.min(1, Math.max(0, t))
	return clamped * clamped * (3 - 2 * clamped)
}

/**
 * Per-cell albedo from a smooth, purely temperature-driven ice/snow
 * transition -- no latitude or obliquity term. Because it reacts to each
 * cell's own already-computed temperature (which already reflects that
 * world's obliquity, eccentricity, and orbital distance through the
 * insolation/diffusion solve upstream), the ice line shifts automatically for
 * exotic configs instead of following a curve baked in for Earth's current
 * climate: a high-obliquity world's poles run warmer and naturally keep less
 * ice; a high-eccentricity world's ice line moves in and out seasonally
 * because this runs once per simulated day already.
 *
 * Replaces an earlier hard step (`if temp < limit: ICE else BASE`) that was
 * disabled after it caused a runaway oscillation for a low-heat-capacity body
 * (see git history / luna-repro): each day's temperature would cross the
 * threshold, the albedo would jump discretely, overshoot, and cross back.
 * The smoothstep ramp removes the discontinuity that caused it while keeping
 * the same physical mechanism.
 */
/**
 * couplingFactor: fades the feedback out toward a flat `baseAlbedo` as
 * pressure -> 0, using the same sqrt(pressure) scaling
 * computeDiffusionCoefficients() already uses for inter-latitude heat
 * transport. At zero pressure there's no atmosphere to move heat between
 * latitude bands or to support the cloud/frost dynamics this feedback
 * approximates, so each band solves an independent, nonlinear (bistable)
 * equilibrium -- neighboring bands can then land on opposite sides of the
 * ice threshold with nothing smoothing across them, producing a real
 * multi-degree jump between adjacent bands (reproduced for an airless,
 * pressure=0, slow-rotating body -- see luna-repro). Damping the feedback's
 * strength by the same knob that already zeroes out cross-band coupling
 * removes exactly that regime instead of widening the temperature transition
 * band, which wouldn't fix a spatial (cross-latitude) discontinuity anyway.
 */
function iceAlbedoAt(
	temperatureK: number,
	baseAlbedo: number,
	iceAlbedo: number,
	couplingFactor: number,
): number {
	const { ICE_LIMIT } = EMB_CONSTANTS.thermal
	const t =
		(temperatureK - (ICE_LIMIT - ICE_TRANSITION_HALF_WIDTH_K)) /
		(2 * ICE_TRANSITION_HALF_WIDTH_K)
	const warmthFraction = smoothstep(t)
	const fullFeedback =
		iceAlbedo * (1 - warmthFraction) + baseAlbedo * warmthFraction
	return baseAlbedo + (fullFeedback - baseAlbedo) * couplingFactor
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
		temperature: number[][]
		time: number
		/** Base (non-ice) Bond albedo -- a single value for the whole body.
		 * Overrides surface.ALBEDO.BASE (0.3, an Earth default). */
		baseAlbedo?: number
		/** Ice-cap albedo, used below the local ice threshold. Overrides
		 * surface.ALBEDO.ICE (0.65, an Earth default). */
		iceAlbedo?: number
		/**
		 * Enables the temperature-driven ice/snow albedo transition above.
		 * Defaults to true (procedural worldgen wants this). Sol-system bodies
		 * that pass their own real, empirically-measured Bond albedo should set
		 * this false -- their `albedo` already IS their true known reflectivity
		 * (ice caps and all), so layering a synthetic ice model on top would
		 * override a real measurement with a generic guess.
		 */
		iceAlbedoFeedback?: boolean
		/** Atmospheric pressure (bar), used to fade the feedback out toward a
		 * flat baseAlbedo as pressure -> 0 -- see iceAlbedoAt's couplingFactor
		 * doc. Defaults to 1.0 (full strength, Earth-like). */
		pressure?: number
	}): void => {
		const {
			albedo,
			temperature,
			time,
			baseAlbedo,
			iceAlbedo,
			iceAlbedoFeedback,
			pressure,
		} = params
		const { surface } = EMB_CONSTANTS
		const base = baseAlbedo ?? surface.ALBEDO.BASE
		const ice = iceAlbedo ?? surface.ALBEDO.ICE
		const couplingFactor = Math.min(1, Math.sqrt(Math.max(0, pressure ?? 1.0)))

		for (let i = 0; i < EMB_CONSTANTS.grid.NUM_LAT; i++) {
			albedo[i][time] =
				(iceAlbedoFeedback ?? true)
					? iceAlbedoAt(temperature[i][time], base, ice, couplingFactor)
					: base
		}
	},
}
