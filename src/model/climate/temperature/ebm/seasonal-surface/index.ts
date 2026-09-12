import type {
	SeasonalAlbedoParams,
	SeasonalSurfaceStepParams,
} from "@/model/climate/temperature/ebm/seasonal-surface/types"

const latentHeat = 3.34e5
const sigma = 5.670367e-8

function step(params: SeasonalSurfaceStepParams) {
	const { temperatureK, iceMass, dt, snowball, config } = params
	const massBalance =
		temperatureK > 273.15
			? (config.ablationFactor * sigma * (273.15 ** 4 - temperatureK ** 4)) /
				latentHeat
			: snowball
				? 0
				: config.iceDepositionRate
	const nextMass = Math.max(0, iceMass + dt * massBalance)
	const latentMass =
		massBalance >= 0 ? dt * massBalance : -Math.min(nextMass, -dt * massBalance)
	return {
		massBalance,
		iceMass: nextMass,
		temperatureK:
			temperatureK + (latentMass * latentHeat) / config.landHeatCapacity,
	}
}

function albedo(params: SeasonalAlbedoParams) {
	return params.iceMass > 0 || params.temperatureK <= 271.15
		? params.iceAlbedo
		: params.baseAlbedo + params.zenithOffset
}

export const SEASONAL_SURFACE = { step, albedo }
