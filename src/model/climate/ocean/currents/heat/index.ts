import type {
	OceanHeat,
	OceanHeatInput,
} from "@/model/climate/ocean/currents/heat/types"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"

function solve({ grid, circulation, yearSeconds }: OceanHeatInput): OceanHeat {
	const n = grid.mesh.numRegions
	const delta = new Float32Array(12 * n)
	const anomaly = new Float64Array(n),
		temperature = new Float64Array(n)
	const tendency = new Float64Array(n),
		divergence = new Float64Array(n)
	const deep = new Float64Array(n)
	const basin = new Int32Array(n).fill(-1)
	const queue = new Int32Array(n)
	const neighbours: number[][] = Array.from({ length: n }, (): number[] => [])
	for (let e = 0; e < grid.a.length; e++) {
		neighbours[grid.a[e]].push(grid.b[e])
		neighbours[grid.b[e]].push(grid.a[e])
	}
	for (let seed = 0; seed < n; seed++) {
		if (!grid.ocean[seed] || basin[seed] >= 0) continue
		let head = 0,
			tail = 1,
			coldest = Infinity
		queue[0] = seed
		basin[seed] = seed
		while (head < tail) {
			const r = queue[head++]
			coldest = Math.min(coldest, grid.climate.temperature_avg[r])
			for (const nb of neighbours[r])
				if (basin[nb] < 0) {
					basin[nb] = seed
					queue[tail++] = nb
				}
		}
		// Deep water is a reservoir at the basin's cold formation temperature.
		for (let k = 0; k < tail; k++) deep[queue[k]] = Math.max(-1.8, coldest)
	}
	const relaxation = 20 / CONSTANTS.embConstants.thermal.OCEAN_HEAT_CAPACITY
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
					(circulation.u[ia] * grid.eastA[e] +
						circulation.v[ia] * grid.northA[e] +
						circulation.u[ib] * grid.eastB[e] +
						circulation.v[ib] * grid.northB[e])
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
