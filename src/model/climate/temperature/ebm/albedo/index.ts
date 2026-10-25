import type { IceAlbedoAtParams } from "@/model/climate/temperature/ebm/albedo/types"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { MATH } from "@/model/shared/math/core"

const ICE_TRANSITION_HALF_WIDTH_K = 8

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

		baseAlbedo?: number

		iceAlbedo?: number

		iceAlbedoFeedback?: boolean

		pressure?: number

		zenithOffset?: readonly number[]
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
		} = params
		const { surface } = CONSTANTS.embConstants
		const base = baseAlbedo ?? surface.ALBEDO.BASE
		const ice = iceAlbedo ?? surface.ALBEDO.ICE
		const couplingFactor = Math.min(1, Math.sqrt(Math.max(0, pressure ?? 1.0)))

		for (let i = 0; i < CONSTANTS.embConstants.grid.NUM_LAT; i++) {
			const localBase = base + (zenithOffset?.[i] ?? 0)
			albedo[i][time] =
				(iceAlbedoFeedback ?? true)
					? iceAlbedoAt({
							temperatureK: temperature[i][time],
							baseAlbedo: localBase,
							iceAlbedo: ice,
							couplingFactor,
						})
					: localBase
		}
	},
}
