import { GRID } from "@/model/climate/weather/wind/grid"
import type {
	IntegrateInput,
	ShallowWaterInput,
	ShallowWaterState,
	ShallowWaterWind,
} from "@/model/climate/weather/wind/shallow-water/types"
import { MATH } from "@/model/shared/math/core"

// Time-stepped nonlinear shallow-water model of the large-scale flow on the
// coarse lat-lon grid, in physical units. The pressure template is the
// resting geopotential the layer relaxes toward; rotation, friction and
// momentum advection then integrate to a steady state whose geopotential
// replaces the template. Unlike the steady linear solve this carries the
// vorticity budget in time, which is what boundary jets and closed gyres
// come from.
// Defines one pressure-template unit as a geopotential perturbation at one bar.
// Atmospheric pressure scales it before integration, matching the wind model's
// existing pressure response without embedding a particular planet's geography.
const GEOPOTENTIAL_PER_TEMPLATE_AT_ONE_BAR = 275
const WAVE_SPEED = 25
const FRICTION_DAYS = 2
const RELAX_DAYS = 2
const VISCOSITY = 5e5
const SPINUP_DAYS = 10
const MIN_SPINUP_TIMESCALES = 3.5
const RESIDUAL_CHECK_STEPS = 8
const CONVERGED_CHECKS = 3
const RESIDUAL_TOLERANCE = 0.13
const MAX_DT = 1800
const CFL = 0.6
const MIN_TERRAIN_TRANSPORT = 0.15
const TERRAIN_BLOCKING_ONSET = 0.15
const TERRAIN_BLOCKING_FULL = 0.65
const TERRAIN_DRAG_MULTIPLIER = 8
// Zonal structure poleward of this latitude is damped toward the zonal mean
// so the converging meridians do not set the time step.
const POLAR_FILTER_LAT = 70
const ADVECTION = 1
const DEG2RAD = Math.PI / 180
const DAY = 86400

function integrate({
	forcing,
	terrain,
	planetRadiusM,
	coriolisPolar,
	pressureScale,
}: IntegrateInput): ShallowWaterState {
	const { lonBins, latBins } = forcing
	const n = lonBins * latBins
	const d = GRID.deg * DEG2RAD
	const dx = planetRadiusM * d
	const a = planetRadiusM
	const eps = 1 / (FRICTION_DAYS * DAY)
	const gamma = 1 / (RELAX_DAYS * DAY)
	const c2 = WAVE_SPEED * WAVE_SPEED

	const cosRow = new Float32Array(latBins)
	const tanRow = new Float32Array(latBins)
	const fRow = new Float32Array(latBins)
	const cosFace = new Float32Array(latBins)
	const tanFace = new Float32Array(latBins)
	const fFace = new Float32Array(latBins)
	const filter = new Float32Array(latBins)
	const cosFilter = Math.cos(POLAR_FILTER_LAT * DEG2RAD)
	let minCos = 1
	for (let j = 0; j < latBins; j++) {
		const lat = (-90 + (j + 0.5) * GRID.deg) * DEG2RAD
		cosRow[j] = Math.cos(lat)
		tanRow[j] = Math.tan(lat)
		fRow[j] = coriolisPolar * Math.sin(lat)
		const latFace = (-90 + (j + 1) * GRID.deg) * DEG2RAD
		cosFace[j] = Math.max(1e-6, Math.cos(latFace))
		tanFace[j] =
			Math.tan(Math.min(89 * DEG2RAD, Math.abs(latFace))) * Math.sign(latFace)
		fFace[j] = coriolisPolar * Math.sin(latFace)
		const ratio = cosRow[j] / cosFilter
		filter[j] = ratio >= 1 ? 0 : 1 - ratio * ratio
		if (cosRow[j] >= cosFilter && cosRow[j] < minCos) minCos = cosRow[j]
	}
	const dxMin = dx * minCos
	const dt = Math.min(
		MAX_DT,
		(CFL * dxMin) / WAVE_SPEED,
		(0.2 * dxMin * dxMin) / VISCOSITY,
	)
	const steps = Math.ceil((SPINUP_DAYS * DAY) / dt)

	const phi0 = new Float32Array(n)
	let phiScale = 0
	for (let idx = 0; idx < n; idx++) {
		phi0[idx] =
			forcing.values[idx] * GEOPOTENTIAL_PER_TEMPLATE_AT_ONE_BAR * pressureScale
		phiScale = Math.max(phiScale, Math.abs(phi0[idx]))
	}
	phiScale = Math.max(phiScale, 1)
	const phi = Float32Array.from(phi0)
	const u = new Float32Array(n)
	const v = new Float32Array(n)
	const uNew = new Float32Array(n)
	const vNew = new Float32Array(n)
	const terrainBlock = new Float32Array(n)
	const transportDepth = new Float32Array(n)
	let maxElevationKm = 0
	for (let idx = 0; idx < n; idx++)
		maxElevationKm = Math.max(maxElevationKm, terrain.values[idx])
	for (let idx = 0; idx < n; idx++) {
		const relativeElevation =
			maxElevationKm > 0 ? Math.max(0, terrain.values[idx]) / maxElevationKm : 0
		const block = MATH.smoothstep({
			edge0: TERRAIN_BLOCKING_ONSET,
			edge1: TERRAIN_BLOCKING_FULL,
			x: relativeElevation,
		})
		terrainBlock[idx] = block
		transportDepth[idx] = 1 - (1 - MIN_TERRAIN_TRANSPORT) * block
	}
	const east = new Int32Array(lonBins)
	const west = new Int32Array(lonBins)
	for (let i = 0; i < lonBins; i++) {
		east[i] = (i + 1) % lonBins
		west[i] = (i - 1 + lonBins) % lonBins
	}
	const zonalTransport = new Float32Array(n)
	const meridionalTransport = new Float32Array(n)
	for (let j = 0; j < latBins; j++) {
		const row = j * lonBins
		const up = row + lonBins
		for (let i = 0; i < lonBins; i++) {
			const idx = row + i
			zonalTransport[idx] = Math.min(
				transportDepth[idx],
				transportDepth[row + east[i]],
			)
			if (j < latBins - 1)
				meridionalTransport[idx] = Math.min(
					transportDepth[idx],
					transportDepth[up + i],
				)
		}
	}
	const minimumSteps = Math.ceil(
		(MIN_SPINUP_TIMESCALES * Math.max(FRICTION_DAYS, RELAX_DAYS) * DAY) / dt,
	)
	let completedSteps = 0
	let convergedSteps = 0
	let residual = Number.POSITIVE_INFINITY
	for (let step = 0; step < steps; step++) {
		const nextCompletedSteps = step + 1
		const measureResidual =
			(nextCompletedSteps >= minimumSteps &&
				(nextCompletedSteps - minimumSteps) % RESIDUAL_CHECK_STEPS === 0) ||
			nextCompletedSteps === steps
		let velocityChangeSquared = 0
		let geopotentialChangeSquared = 0
		for (let j = 0; j < latBins; j++) {
			const row = j * lonBins
			const up = j < latBins - 1 ? row + lonBins : row
			const down = j > 0 ? row - lonBins : row
			const dxRow = dx * Math.max(cosRow[j], cosFilter)
			const f = fRow[j]
			for (let i = 0; i < lonBins; i++) {
				const idx = row + i
				const ie = east[i]
				const iw = west[i]
				const vBar =
					0.25 *
					((j < latBins - 1 ? v[idx] + v[row + ie] : 0) +
						(j > 0 ? v[down + i] + v[down + ie] : 0))
				const phiX = (phi[row + ie] - phi[idx]) / dxRow
				const uc = u[idx]
				const terrainDrag =
					eps *
					TERRAIN_DRAG_MULTIPLIER *
					Math.max(terrainBlock[idx], terrainBlock[row + ie])
				const adv =
					(uc * (u[row + ie] - u[row + iw])) / (2 * dxRow) +
					(vBar * (u[up + i] - u[down + i])) / (2 * dx) -
					(uc * vBar * tanRow[j]) / a
				const lap =
					(u[row + ie] - 2 * uc + u[row + iw]) / (dxRow * dxRow) +
					(u[up + i] - 2 * uc + u[down + i]) / (dx * dx)
				const nextU =
					(uc + dt * (f * vBar - phiX - ADVECTION * adv + VISCOSITY * lap)) /
					(1 + dt * (eps + terrainDrag))
				uNew[idx] = nextU
				if (measureResidual)
					velocityChangeSquared += (nextU - uc) * (nextU - uc)
			}
		}
		for (let j = 0; j < latBins - 1; j++) {
			const row = j * lonBins
			const up = row + lonBins
			const dxRow = dx * Math.max(cosFace[j], cosFilter)
			const f = fFace[j]
			for (let i = 0; i < lonBins; i++) {
				const idx = row + i
				const ie = east[i]
				const iw = west[i]
				const uBar =
					0.25 * (uNew[idx] + uNew[row + iw] + uNew[up + i] + uNew[up + iw])
				const phiY = (phi[up + i] - phi[idx]) / dx
				const vc = v[idx]
				const terrainDrag =
					eps *
					TERRAIN_DRAG_MULTIPLIER *
					Math.max(terrainBlock[idx], terrainBlock[up + i])
				const vN = j < latBins - 2 ? v[up + i] : 0
				const vS = j > 0 ? v[row - lonBins + i] : 0
				const adv =
					(uBar * (v[row + ie] - v[row + iw])) / (2 * dxRow) +
					(vc * (vN - vS)) / (2 * dx) +
					(uBar * uBar * tanFace[j]) / a
				const lap =
					(v[row + ie] - 2 * vc + v[row + iw]) / (dxRow * dxRow) +
					(vN - 2 * vc + vS) / (dx * dx)
				const nextV =
					(vc + dt * (-f * uBar - phiY - ADVECTION * adv + VISCOSITY * lap)) /
					(1 + dt * (eps + terrainDrag))
				vNew[idx] = nextV
				if (measureResidual)
					velocityChangeSquared += (nextV - vc) * (nextV - vc)
			}
		}
		vNew.fill(0, (latBins - 1) * lonBins, n)
		u.set(uNew)
		v.set(vNew)
		for (let j = 0; j < latBins; j++) {
			const row = j * lonBins
			const c = cosRow[j]
			const cN = j < latBins - 1 ? cosFace[j] : 0
			const cS = j > 0 ? cosFace[j - 1] : 0
			const dxRow = dx * Math.max(c, cosFilter)
			for (let i = 0; i < lonBins; i++) {
				const idx = row + i
				const div =
					(u[idx] * zonalTransport[idx] -
						u[row + west[i]] * zonalTransport[row + west[i]]) /
						dxRow +
					((j < latBins - 1 ? v[idx] * cN * meridionalTransport[idx] : 0) -
						(j > 0
							? v[idx - lonBins] * cS * meridionalTransport[idx - lonBins]
							: 0)) /
						(dx * c)
				const previousPhi = phi[idx]
				const nextPhi =
					(phi[idx] + dt * (-c2 * div + gamma * phi0[idx])) / (1 + dt * gamma)
				phi[idx] = nextPhi
				if (measureResidual)
					geopotentialChangeSquared +=
						(nextPhi - previousPhi) * (nextPhi - previousPhi)
			}
		}
		for (let j = 0; j < latBins; j++) {
			if (filter[j] === 0) continue
			const row = j * lonBins
			let mu = 0
			let mv = 0
			let mp = 0
			for (let i = 0; i < lonBins; i++) {
				mu += u[row + i]
				mv += v[row + i]
				mp += phi[row + i]
			}
			mu /= lonBins
			mv /= lonBins
			mp /= lonBins
			const w = filter[j]
			for (let i = 0; i < lonBins; i++) {
				const idx = row + i
				const uChange = w * (mu - u[idx])
				const vChange = w * (mv - v[idx])
				const phiChange = w * (mp - phi[idx])
				u[idx] += uChange
				v[idx] += vChange
				phi[idx] += phiChange
				if (measureResidual) {
					velocityChangeSquared += uChange * uChange + vChange * vChange
					geopotentialChangeSquared += phiChange * phiChange
				}
			}
		}
		completedSteps = nextCompletedSteps
		if (measureResidual) {
			const velocityChange = Math.sqrt(velocityChangeSquared / (2 * n))
			const geopotentialChange = Math.sqrt(geopotentialChangeSquared / n)
			residual = Math.max(
				(velocityChange * FRICTION_DAYS * DAY) / (dt * WAVE_SPEED),
				(geopotentialChange * RELAX_DAYS * DAY) / (dt * phiScale),
			)
			if (residual < RESIDUAL_TOLERANCE) convergedSteps++
			else convergedSteps = 0
			if (convergedSteps >= CONVERGED_CHECKS) break
		}
	}
	for (let idx = 0; idx < n; idx++) {
		if (!Number.isFinite(phi[idx])) {
			// A diverged integration must not poison the world: fall back to
			// the resting template.
			return {
				lonBins,
				latBins,
				phi: phi0,
				u: new Float32Array(n),
				v: new Float32Array(n),
				steps: completedSteps,
				dt,
				residual,
			}
		}
	}
	return { lonBins, latBins, phi, u, v, steps: completedSteps, dt, residual }
}

function solveMonth({
	latDeg,
	lonDeg,
	pressure,
	elevation_km,
	planetRadiusM,
	coriolisPolar,
	pressureScale,
}: ShallowWaterInput): { forcing: Float32Array; state: ShallowWaterState } {
	const forcing = GRID.build({ latDeg, lonDeg, values: pressure })
	const terrain = GRID.build({ latDeg, lonDeg, values: elevation_km })
	const state = integrate({
		forcing,
		terrain,
		planetRadiusM,
		coriolisPolar,
		pressureScale,
	})
	return { forcing: forcing.values, state }
}

// The large-scale flow reaches the surface through the Ekman layer: slowed
// and turned toward low pressure (left of the flow in the northern
// hemisphere, right in the southern). Returns per-cell surface wind in m/s
// plus the coarse template each cell's large-scale part came from, so the
// caller can keep only the sub-grid residual of its own balance.
const EKMAN_FACTOR_OCEAN = 0.7
const EKMAN_ANGLE_OCEAN_DEG = 20
const EKMAN_FACTOR_LAND = 0.35
const EKMAN_ANGLE_LAND_DEG = 35

function surfaceWind(input: ShallowWaterInput): ShallowWaterWind {
	const { forcing, state } = solveMonth(input)
	const { lonBins, latBins } = state
	const grid = (values: Float32Array) => ({ lonBins, latBins, values })
	// Cell-centred velocity from the C-grid faces.
	const uc = new Float32Array(state.u.length)
	const vc = new Float32Array(state.v.length)
	for (let j = 0; j < latBins; j++) {
		const row = j * lonBins
		for (let i = 0; i < lonBins; i++) {
			const iw = (i - 1 + lonBins) % lonBins
			uc[row + i] = 0.5 * (state.u[row + i] + state.u[row + iw])
			const vN = j < latBins - 1 ? state.v[row + i] : 0
			const vS = j > 0 ? state.v[row - lonBins + i] : 0
			vc[row + i] = 0.5 * (vN + vS)
		}
	}
	const uS = GRID.sample({
		grid: grid(uc),
		latDeg: input.latDeg,
		lonDeg: input.lonDeg,
	})
	const vS = GRID.sample({
		grid: grid(vc),
		latDeg: input.latDeg,
		lonDeg: input.lonDeg,
	})
	const coarsePressure = GRID.sample({
		grid: grid(forcing),
		latDeg: input.latDeg,
		lonDeg: input.lonDeg,
	})
	const ocean = {
		factor: EKMAN_FACTOR_OCEAN,
		cosA: Math.cos(EKMAN_ANGLE_OCEAN_DEG * DEG2RAD),
		sinA: Math.sin(EKMAN_ANGLE_OCEAN_DEG * DEG2RAD),
	}
	const land = {
		factor: EKMAN_FACTOR_LAND,
		cosA: Math.cos(EKMAN_ANGLE_LAND_DEG * DEG2RAD),
		sinA: Math.sin(EKMAN_ANGLE_LAND_DEG * DEG2RAD),
	}
	for (let r = 0; r < uS.length; r++) {
		const turn = Math.sign(input.latDeg[r]) * Math.sign(input.coriolisPolar)
		const layer = input.elevation_km[r] > 0 ? land : ocean
		const u = uS[r]
		const v = vS[r]
		uS[r] = layer.factor * (u * layer.cosA - turn * v * layer.sinA)
		vS[r] = layer.factor * (turn * u * layer.sinA + v * layer.cosA)
	}
	return {
		u: uS,
		v: vS,
		coarsePressure,
		steps: state.steps,
	}
}

export const SHALLOW_WATER = {
	surfaceWind,
	solveMonth,
}
