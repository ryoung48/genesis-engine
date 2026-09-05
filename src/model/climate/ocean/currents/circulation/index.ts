import type {
	CirculationInput,
	OceanCirculation,
} from "@/model/climate/ocean/currents/circulation/types"
import { OCEAN_GYRES } from "@/model/climate/ocean/currents/gyres"
import { UNITS } from "@/model/shared/units"

const WATER_DENSITY = 1025
const ACTIVE_DEPTH = 200
const MIXED_DEPTH = 25
const DRAG_RATE = 1 / (90 * 86400)
const BOUNDARY_LAYER_CELLS = 1
// First baroclinic mode gravity wave speed, which sets the width of the
// equatorial waveguide.
const BAROCLINIC_SPEED = 2
const EQUATORIAL_DRAG = 1 / (12 * 86400)

function solve({ grid, params, wind }: CirculationInput): OceanCirculation {
	const n = grid.mesh.numRegions
	const length = 12 * n
	const result: OceanCirculation = {
		u: new Float32Array(length),
		v: new Float32Array(length),
		transportU: new Float32Array(length),
		transportV: new Float32Array(length),
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
		Array(n).keys(),
		(r) => 2 * omega * grid.mesh.r_xyz[3 * r + 2],
	)
	const forceU = new Float64Array(length),
		forceV = new Float64Array(length)
	const ekmanU = new Float64Array(length),
		ekmanV = new Float64Array(length)
	const surfaceU = new Float64Array(length),
		surfaceV = new Float64Array(length)
	const jetU = new Float64Array(length)
	// Coriolis cannot balance a zonal wind stress where f vanishes, so within a
	// deformation radius of the equator the stress instead drives a zonal jet
	// against drag -- the equatorial current system the geostrophic gyre misses.
	const deformation = Math.sqrt(
		(BAROCLINIC_SPEED * params.planetRadiusKm * 1000) / (2 * Math.abs(omega)),
	)
	for (let i = 0; i < length; i++) {
		const r = i % n
		if (!grid.ocean[r]) continue
		const temperature = grid.climate.temperature_monthly[i]
		const openWater = Math.max(0, Math.min(1, (temperature + 2) / 4))
		const density =
			((params.pressure ?? 1) * 100000) /
			(287.05 * Math.max(180, temperature + 273.15))
		const speed = Math.hypot(wind.u[i], wind.v[i])
		if (!Number.isFinite(temperature + speed))
			throw new Error(
				`Invalid ocean forcing i=${i} source=${grid.source[r]} temperature=${temperature} wind=${wind.u[i]},${wind.v[i]}`,
			)
		const stressFactor = (density * 0.0013 * speed * openWater) / WATER_DENSITY
		forceU[i] = (stressFactor * wind.u[i]) / ACTIVE_DEPTH
		forceV[i] = (stressFactor * wind.v[i]) / ACTIVE_DEPTH
		// The damped Ekman spiral has a finite depth even when rotation vanishes.
		const mixingRate = 1 / 86400
		const stressU = stressFactor * wind.u[i],
			stressV = stressFactor * wind.v[i]
		const viscosity =
			0.01 + 0.1 * MIXED_DEPTH * Math.sqrt(Math.hypot(stressU, stressV))
		const frequency = Math.hypot(mixingRate, f[r])
		const qr = Math.sqrt((frequency + mixingRate) / (2 * viscosity))
		const qi =
			Math.sign(f[r]) * Math.sqrt((frequency - mixingRate) / (2 * viscosity))
		const denominator = viscosity * (qr * qr + qi * qi)
		const topU = (stressU * qr + stressV * qi) / denominator
		const topV = (stressV * qr - stressU * qi) / denominator
		// Velocities represent the upper five metres, matching the near-surface layer.
		const attenuation = Math.exp(-5 * qr),
			cosine = Math.cos(5 * qi),
			sine = Math.sin(5 * qi)
		surfaceU[i] = attenuation * (topU * cosine + topV * sine)
		surfaceV[i] = attenuation * (topV * cosine - topU * sine)
		const integralReal =
			1 - Math.exp(-qr * MIXED_DEPTH) * Math.cos(qi * MIXED_DEPTH)
		const integralImaginary =
			Math.exp(-qr * MIXED_DEPTH) * Math.sin(qi * MIXED_DEPTH)
		const meanDenominator = MIXED_DEPTH * (qr * qr + qi * qi)
		const meanReal =
			(integralReal * qr + integralImaginary * qi) / meanDenominator
		const meanImaginary =
			(integralImaginary * qr - integralReal * qi) / meanDenominator
		ekmanU[i] = topU * meanReal - topV * meanImaginary
		ekmanV[i] = topU * meanImaginary + topV * meanReal
		const distance =
			params.planetRadiusKm * 1000 * Math.asin(grid.mesh.r_xyz[3 * r + 2])
		jetU[i] =
			(forceU[i] / EQUATORIAL_DRAG) * Math.exp(-((distance / deformation) ** 2))
	}
	const gyres = OCEAN_GYRES.solve({
		grid,
		forceU,
		forceV,
		omega,
		radius: params.planetRadiusKm * 1000,
		// The Stommel boundary layer is drag / beta wide. Left at the seasonal
		// drag rate it comes out tens of kilometres across -- far under a cell,
		// so the upwind scheme's own diffusion sets the solution instead. Sizing
		// it to a cell keeps what the mesh can actually carry, and the planet
		// radius cancels out of beta times the cell width.
		drag:
			2 *
			Math.abs(omega) *
			Math.cos(Math.PI / 6) *
			Math.sqrt((4 * Math.PI) / n) *
			BOUNDARY_LAYER_CELLS,
	})
	result.cycleError = gyres.residual
	const monthSeconds = yearSeconds / 12
	const memory = Math.exp(-monthSeconds * DRAG_RATE)
	const meanWeight = (1 - memory) / Math.max(1e-15, monthSeconds * DRAG_RATE)
	for (let r = 0; r < n; r++) {
		let stateU = 0,
			stateV = 0
		for (let month = 0; month < 12; month++) {
			stateU = memory * stateU + (1 - memory) * gyres.u[month * n + r]
			stateV = memory * stateV + (1 - memory) * gyres.v[month * n + r]
		}
		stateU /= -Math.expm1(-yearSeconds * DRAG_RATE)
		stateV /= -Math.expm1(-yearSeconds * DRAG_RATE)
		for (let month = 0; month < 12; month++) {
			const i = month * n + r
			const targetU = gyres.u[i],
				targetV = gyres.v[i]
			const meanU = targetU + (stateU - targetU) * meanWeight
			const meanV = targetV + (stateV - targetV) * meanWeight
			stateU = memory * stateU + (1 - memory) * targetU
			stateV = memory * stateV + (1 - memory) * targetV
			const interiorU =
				meanU - (MIXED_DEPTH / ACTIVE_DEPTH) * ekmanU[i] + jetU[i]
			const interiorV = meanV - (MIXED_DEPTH / ACTIVE_DEPTH) * ekmanV[i]
			result.transportU[i] = interiorU + ekmanU[i]
			result.transportV[i] = interiorV + ekmanV[i]
			result.u[i] = interiorU + surfaceU[i]
			result.v[i] = interiorV + surfaceV[i]
		}
	}
	return result
}

export const OCEAN_CIRCULATION = { solve }
