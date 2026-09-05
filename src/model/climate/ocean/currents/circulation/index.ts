import type {
	CirculationInput,
	OceanCirculation,
} from "@/model/climate/ocean/currents/circulation/types"
import { UNITS } from "@/model/shared/units"

const WATER_DENSITY = 1025
const ACTIVE_DEPTH = 200
const MIXED_DEPTH = 25
const REDUCED_GRAVITY = 0.02
const DRAG_RATE = 1 / (90 * 86400)
const VISCOSITY = 2000

function solve({ grid, params, wind }: CirculationInput): OceanCirculation {
	const n = grid.mesh.numRegions
	const length = 12 * n
	const result: OceanCirculation = {
		u: new Float32Array(length),
		v: new Float32Array(length),
		transportU: new Float32Array(length),
		transportV: new Float32Array(length),
		spinupYears: 0,
		cycleError: 0,
	}
	if (!grid.a.length) return result
	const yearSeconds = params.daysPerYear * params.hoursPerDay * 3600
	if (!(yearSeconds > 0) || !Number.isFinite(yearSeconds))
		throw new Error(
			"Ocean circulation requires a finite positive orbital period",
		)
	const omega =
		((2 * Math.PI) / (params.hoursPerDay * 3600)) *
		(UNITS.isRetrogradeObliquity(params.obliquity) ? -1 : 1)
	const f = Float64Array.from(
		{ length: n },
		(_value, r) => 2 * omega * grid.mesh.r_xyz[3 * r + 2],
	)
	const forceU = new Float64Array(length),
		forceV = new Float64Array(length)
	const ekmanU = new Float64Array(length),
		ekmanV = new Float64Array(length)
	for (let i = 0; i < length; i++) {
		const r = i % n
		if (!grid.ocean[r]) continue
		const temperature = grid.climate.temperature_monthly[i]
		const openWater = Math.max(0, Math.min(1, (temperature + 2) / 4))
		const density =
			((params.pressure ?? 1) * 100000) /
			(287.05 * Math.max(180, temperature + 273.15))
		const speed = Math.hypot(wind.u[i], wind.v[i])
		if (!Number.isFinite(temperature + speed)) throw new Error(`Invalid ocean forcing i=${i} source=${grid.source[r]} temperature=${temperature} wind=${wind.u[i]},${wind.v[i]}`)
		const stressFactor = (density * 0.0013 * speed * openWater) / WATER_DENSITY
		forceU[i] = (stressFactor * wind.u[i]) / ACTIVE_DEPTH
		forceV[i] = (stressFactor * wind.v[i]) / ACTIVE_DEPTH
		// A damped slab remains finite at the equator and for very slow rotation.
		const mixingRate = 1 / 86400
		const denominator = mixingRate * mixingRate + f[r] * f[r]
		const ax = (stressFactor * wind.u[i]) / MIXED_DEPTH
		const ay = (stressFactor * wind.v[i]) / MIXED_DEPTH
		ekmanU[i] = (mixingRate * ax + f[r] * ay) / denominator
		ekmanV[i] = (mixingRate * ay - f[r] * ax) / denominator
	}
	const u = new Float64Array(n),
		v = new Float64Array(n),
		height = new Float64Array(n)
	const gx = new Float64Array(n),
		gy = new Float64Array(n),
		divergence = new Float64Array(n)
	const mixU = new Float64Array(n),
		mixV = new Float64Array(n)
	const previousU = new Float64Array(n),
		previousV = new Float64Array(n),
		previousHeight = new Float64Array(n)
	const gravity = (REDUCED_GRAVITY * params.planetRadiusKm) / 6371
	const waveSpeed = Math.sqrt(gravity * ACTIVE_DEPTH)
	const stableStep = Math.min(
		21600,
		(0.2 * grid.minimumLength) / waveSpeed,
		(0.05 * grid.minimumLength ** 2) / VISCOSITY,
	)
	const stepsPerMonth = Math.max(1, Math.ceil(yearSeconds / 12 / stableStep))
	const dt = yearSeconds / (12 * stepsPerMonth)
	if (stepsPerMonth > 20000)
		throw new Error(
			"Ocean time integration exceeds the supported orbital-period/resolution range",
		)
	const maxYears = Math.max(
		4,
		Math.min(16, Math.ceil((4 * 365.25 * 86400) / yearSeconds)),
	)
	for (let year = 0; year < maxYears; year++) {
		previousU.set(u)
		previousV.set(v)
		previousHeight.set(height)
		result.u.fill(0)
		result.v.fill(0)
		result.transportU.fill(0)
		result.transportV.fill(0)
		for (let month = 0; month < 12; month++) {
			for (let step = 0; step < stepsPerMonth; step++) {
				gx.fill(0)
				gy.fill(0)
				mixU.fill(0)
				mixV.fill(0)
				for (let e = 0; e < grid.a.length; e++) {
					const a = grid.a[e],
						b = grid.b[e]
					const pressure =
						gravity * (height[b] - height[a]) * grid.width[e] * 0.5
					gx[a] += pressure * grid.eastA[e]
					gy[a] += pressure * grid.northA[e]
					gx[b] += pressure * grid.eastB[e]
					gy[b] += pressure * grid.northB[e]
					const mixing = (VISCOSITY * grid.width[e]) / grid.distance[e]
					// Parallel-transport neighbour vectors through their shared edge frame.
					const alongA = u[a] * grid.eastA[e] + v[a] * grid.northA[e]
					const alongB = u[b] * grid.eastB[e] + v[b] * grid.northB[e]
					const acrossA = -u[a] * grid.northA[e] + v[a] * grid.eastA[e]
					const acrossB = -u[b] * grid.northB[e] + v[b] * grid.eastB[e]
					const along = (alongB - alongA) * mixing,
						across = (acrossB - acrossA) * mixing
					mixU[a] += along * grid.eastA[e] - across * grid.northA[e]
					mixV[a] += along * grid.northA[e] + across * grid.eastA[e]
					mixU[b] -= along * grid.eastB[e] - across * grid.northB[e]
					mixV[b] -= along * grid.northB[e] + across * grid.eastB[e]
				}
				const phase = (step + 0.5) / stepsPerMonth - 0.5
				const adjacentMonth = (month + (phase < 0 ? 11 : 1)) % 12
				const blend = Math.abs(phase)
				for (let r = 0; r < n; r++) {
					if (!grid.ocean[r]) continue
					const i = month * n + r,
						other = adjacentMonth * n + r
					const ax = forceU[i] * (1 - blend) + forceU[other] * blend
					const ay = forceV[i] * (1 - blend) + forceV[other] * blend
					const depth = Math.max(MIXED_DEPTH, -grid.elevation[r] * 1000)
					const drag = DRAG_RATE + (0.0025 * Math.hypot(u[r], v[r])) / depth
					const damping = 1 + dt * drag,
						turn = dt * f[r]
					const x = u[r] + dt * (ax + (mixU[r] - gx[r]) / grid.area[r])
					const y = v[r] + dt * (ay + (mixV[r] - gy[r]) / grid.area[r])
					const denominator = damping * damping + turn * turn
					u[r] = (damping * x + turn * y) / denominator
					v[r] = (damping * y - turn * x) / denominator
					if (!Number.isFinite(u[r]) || !Number.isFinite(v[r]))
						throw new Error(`Ocean momentum solver diverged: year=${year} month=${month} step=${step} region=${r} area=${grid.area[r]} f=${f[r]} force=${ax},${ay} height=${height[r]} gradient=${gx[r]},${gy[r]} depth=${depth} dt=${dt}`)
					result.transportU[i] += u[r] / stepsPerMonth
					result.transportV[i] += v[r] / stepsPerMonth
					result.u[i] +=
						(u[r] + ekmanU[i] * (1 - blend) + ekmanU[other] * blend) /
						stepsPerMonth
					result.v[i] +=
						(v[r] + ekmanV[i] * (1 - blend) + ekmanV[other] * blend) /
						stepsPerMonth
				}
				divergence.fill(0)
				for (let e = 0; e < grid.a.length; e++) {
					const a = grid.a[e],
						b = grid.b[e]
					const flux =
						0.5 *
						grid.width[e] *
						(u[a] * grid.eastA[e] +
							v[a] * grid.northA[e] +
							u[b] * grid.eastB[e] +
							v[b] * grid.northB[e])
					divergence[a] += flux
					divergence[b] -= flux
				}
				for (let r = 0; r < n; r++)
					if (grid.ocean[r])
						height[r] -= (dt * ACTIVE_DEPTH * divergence[r]) / grid.area[r]
			}
		}
		let error = 0,
			totalArea = 0
		for (let r = 0; r < n; r++) {
			if (!grid.ocean[r]) continue
			error +=
				grid.area[r] *
				((u[r] - previousU[r]) ** 2 +
					(v[r] - previousV[r]) ** 2 +
					(gravity / ACTIVE_DEPTH) * (height[r] - previousHeight[r]) ** 2)
			totalArea += grid.area[r]
		}
		result.spinupYears = year + 1
		result.cycleError = Math.sqrt(error / Math.max(1, totalArea))
		if (year >= 2 && result.cycleError < 0.002) break
	}
	return result
}

export const OCEAN_CIRCULATION = { solve }
