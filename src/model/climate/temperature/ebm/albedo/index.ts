import type { IceAlbedoAtParams } from "@/model/climate/temperature/ebm/albedo/types"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { MATH } from "@/model/shared/math/core"

const ICE_TRANSITION_HALF_WIDTH_K = 8
// Perennial ice needs a colder year than seasonal snow needs a cold day: an
// ice sheet survives where the annual mean sits this far below ICE_LIMIT.
const PERENNIAL_ICE_OFFSET_K = 14

function iceAlbedoAt(params: IceAlbedoAtParams): number {
	const { temperatureK, baseAlbedo, iceAlbedo, couplingFactor } = params
	const { ICE_LIMIT } = CONSTANTS.embConstants.thermal
	const warmthFraction = MATH.smoothstep({
		edge0: ICE_LIMIT - ICE_TRANSITION_HALF_WIDTH_K,
		edge1: ICE_LIMIT + ICE_TRANSITION_HALF_WIDTH_K,
		x: temperatureK,
	})
	const fullFeedback =
		iceAlbedo * (1 - warmthFraction) + baseAlbedo * warmthFraction
	return baseAlbedo + (fullFeedback - baseAlbedo) * couplingFactor
}

export const ALBEDO = {
	iceAlbedoAt,
	landFraction: () => {
		return Array.from(
			{ length: CONSTANTS.embConstants.grid.NUM_LAT },
			(_, i) => {
				const lat = Math.abs(
					(-90 + (180 * i) / CONSTANTS.embConstants.grid.NUM_LAT) as number,
				)
				return lat < 20 ? 0.35 : lat < 55 ? 0.3 : 0.2
			},
		)
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
		/**
		 * Per-latitude seasonal correction added to baseAlbedo before the ice
		 * blend, e.g. `0.08 * (3*sin(zenith)^2 - 1) / 2` from VPlanet's POISE
		 * module -- surfaces (water especially) reflect more at low sun angles
		 * (grazing incidence), so the ice-free albedo isn't flat across the
		 * year even where nothing freezes. Only touches the non-ice branch of
		 * the blend, same as POISE (a fully ice-locked latitude still reports
		 * the flat iceAlbedo regardless of sun angle). Omit for no correction.
		 */
		zenithOffset?: readonly number[]
		/** Per-latitude coolings (K) of the surfaces the ice criterion sees,
		 * one per land elevation quantile; the albedo is averaged over them
		 * while the column itself stays at sea level. */
		iceElevationOffsetsK?: readonly (readonly number[])[]
	}): void => {
		const {
			albedo,
			temperature,
			time,
			baseAlbedo,
			iceAlbedo,
			iceAlbedoFeedback,
			pressure,
			zenithOffset,
			iceElevationOffsetsK,
		} = params
		const { surface } = CONSTANTS.embConstants
		const base = baseAlbedo ?? surface.ALBEDO.BASE
		const ice = iceAlbedo ?? surface.ALBEDO.ICE
		const couplingFactor = Math.min(1, Math.sqrt(Math.max(0, pressure ?? 1.0)))

		for (let i = 0; i < CONSTANTS.embConstants.grid.NUM_LAT; i++) {
			const localBase = base + (zenithOffset?.[i] ?? 0)
			// Ice persists where the year as a whole is cold (ice sheets keep
			// their albedo through a summer above freezing), and seasonal snow
			// still follows the instantaneous temperature: whichever is colder.
			const row = temperature[i]
			let annualSum = 0
			for (let d = 0; d < row.length; d++) annualSum += row[d]
			const annualMeanK = annualSum / row.length
			if (iceAlbedoFeedback === false) {
				albedo[i][time] = localBase
				continue
			}
			// Elevation only enters the perennial branch: ice sheets sit on high
			// ground, while seasonal snow is judged at the column's own level.
			const offsets = iceElevationOffsetsK?.[i] ?? [0]
			let sum = 0
			for (const offset of offsets) {
				sum += iceAlbedoAt({
					temperatureK: Math.min(
						row[time],
						annualMeanK + PERENNIAL_ICE_OFFSET_K - offset,
					),
					baseAlbedo: localBase,
					iceAlbedo: ice,
					couplingFactor,
				})
			}
			albedo[i][time] = sum / offsets.length
		}
	},
}
