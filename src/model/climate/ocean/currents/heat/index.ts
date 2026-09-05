import type {
	OceanHeat,
	OceanHeatInput,
} from "@/model/climate/ocean/currents/heat/types"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"

const THERMOCLINE_DESCENT = 0.5
const MAX_THERMOCLINE_CONTRAST = 12
const AIR_SEA_RESTORING = 10

function solve({ grid, circulation, yearSeconds }: OceanHeatInput): OceanHeat {
	const n = grid.mesh.numRegions
	const delta = new Float32Array(12 * n)
	const anomaly = new Float64Array(n),
		temperature = new Float64Array(n)
	const tendency = new Float64Array(n),
		divergence = new Float64Array(n)
	const deep = new Float64Array(n)
	const formation = new Map<number, number>()
	for (let r = 0; r < n; r++) {
		if (!grid.ocean[r]) continue
		const coldest = formation.get(grid.body[r])
		const average = grid.climate.temperature_avg[r]
		if (coldest === undefined || average < coldest)
			formation.set(grid.body[r], average)
	}
	// Divergence entrains water from just below the mixed layer, not from the
	// abyss, so the entrained temperature lies part of the way from the local
	// surface down to the temperature the body forms its deep water at. As a
	// fraction rather than a fixed contrast it follows the stratification: a
	// sharp shallow tropical thermocline, almost none under a polar surface
	// already near freezing.
	for (let r = 0; r < n; r++) {
		if (!grid.ocean[r]) continue
		const source = Math.max(-1.8, formation.get(grid.body[r]) as number)
		const average = grid.climate.temperature_avg[r]
		deep[r] =
			average -
			Math.min(
				THERMOCLINE_DESCENT * Math.max(0, average - source),
				MAX_THERMOCLINE_CONTRAST,
			)
	}
	// Restoring toward the baseline, which is already the equilibrium the
	// atmosphere holds without ocean transport -- so this damps only what the
	// transport itself moves. At a full air-sea flux feedback it damps twice
	// and flattens the anomaly the rest of the model exists to produce.
	const relaxation =
		AIR_SEA_RESTORING / CONSTANTS.embConstants.thermal.OCEAN_HEAT_CAPACITY
	const diffusion = 500
	const flux = new Float64Array(grid.a.length)
	const rates = new Float64Array(n)
	const previous = new Float64Array(n)
	let cycleError = 0
	for (let year = 0; year < 12; year++) {
		previous.set(anomaly)
		delta.fill(0)
		for (let month = 0; month < 12; month++) {
			rates.fill(relaxation)
			divergence.fill(0)
			for (let e = 0; e < grid.a.length; e++) {
				const a = grid.a[e],
					b = grid.b[e],
					ia = month * n + a,
					ib = month * n + b
				flux[e] =
					0.5 *
					grid.width[e] *
					(circulation.transportU[ia] * grid.eastA[e] +
						circulation.transportV[ia] * grid.northA[e] +
						circulation.transportU[ib] * grid.eastB[e] +
						circulation.transportV[ib] * grid.northB[e])
				divergence[a] += flux[e]
				divergence[b] -= flux[e]
				const mixing = (diffusion * grid.width[e]) / grid.distance[e]
				rates[a] += (Math.max(0, flux[e]) + mixing) / grid.area[a]
				rates[b] += (Math.max(0, -flux[e]) + mixing) / grid.area[b]
			}
			let maxRate = relaxation
			for (let r = 0; r < n; r++)
				if (grid.ocean[r])
					maxRate = Math.max(
						maxRate,
						rates[r] + Math.max(0, -divergence[r]) / grid.area[r],
					)
			const steps = Math.max(1, Math.ceil(((yearSeconds / 12) * maxRate) / 0.5))
			if (steps > 100000)
				throw new Error(
					"Ocean heat transport exceeds its stable integration budget",
				)
			const dt = yearSeconds / (12 * steps)
			for (let step = 0; step < steps; step++) {
				const phase = (step + 0.5) / steps - 0.5,
					blend = Math.abs(phase)
				const other = (month + (phase < 0 ? 11 : 1)) % 12
				for (let r = 0; r < n; r++) {
					const baseline =
						grid.climate.temperature_monthly[month * n + r] * (1 - blend) +
						grid.climate.temperature_monthly[other * n + r] * blend
					temperature[r] = baseline + anomaly[r]
					tendency[r] = -relaxation * anomaly[r] * grid.area[r]
					// Convergence exports surface water; divergence entrains colder water.
					tendency[r] +=
						divergence[r] *
						(divergence[r] > 0
							? Math.min(temperature[r], deep[r])
							: temperature[r])
				}
				for (let e = 0; e < grid.a.length; e++) {
					const a = grid.a[e],
						b = grid.b[e]
					const transport =
						flux[e] * (flux[e] >= 0 ? temperature[a] : temperature[b]) +
						((diffusion * grid.width[e]) / grid.distance[e]) *
							(temperature[a] - temperature[b])
					tendency[a] -= transport
					tendency[b] += transport
				}
				for (let r = 0; r < n; r++) {
					if (!grid.ocean[r]) continue
					anomaly[r] += (dt * tendency[r]) / grid.area[r]
					if (!Number.isFinite(anomaly[r]))
						throw new Error("Ocean heat solver diverged")
					delta[month * n + r] += anomaly[r] / steps
				}
			}
		}
		let error = 0,
			area = 0
		for (let r = 0; r < n; r++)
			if (grid.ocean[r]) {
				error += grid.area[r] * (anomaly[r] - previous[r]) ** 2
				area += grid.area[r]
			}
		cycleError = Math.sqrt(error / Math.max(1, area))
		if (year >= 2 && cycleError < 0.01) break
	}
	return { delta, cycleError }
}

export const OCEAN_HEAT = { solve }
