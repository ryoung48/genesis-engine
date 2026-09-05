import type {
	DynamicCorrectionInput,
	SolveDynamicsInput,
} from "@/model/climate/weather/wind/dynamics/types"
import { GRID } from "@/model/climate/weather/wind/grid"
import type { LatLonGrid } from "@/model/climate/weather/wind/grid/types"

// Steady linear shallow-water (Gill-Matsuno) balance on a coarse lat-lon
// grid. The pressure template is the forcing: without dynamics the solved
// geopotential equals it exactly. Mass conservation with latitude-varying
// Coriolis then fills convergent lows, drains divergent highs, and shifts
// the response east-west (Rossby west of a heat low, Kelvin east of it),
// which is what closes anticyclones over basins and piles cross-equatorial
// flow against western boundaries.
const ITERATIONS = 150
const RELAX = 0.6
const TOLERANCE = 1e-6
const DEG2RAD = Math.PI / 180

function solve({
	forcing,
	friction,
	coriolisScale,
	waveCoupling,
}: SolveDynamicsInput): LatLonGrid {
	const { lonBins, latBins } = forcing
	const P0 = forcing.values
	const d = GRID.deg * DEG2RAD
	const eps = friction
	const cosRow = new Float32Array(latBins)
	const fRow = new Float32Array(latBins)
	const cosFace = new Float32Array(latBins)
	const fFace = new Float32Array(latBins)
	const diag = new Float32Array(latBins)
	for (let j = 0; j < latBins; j++) {
		const lat = (-90 + (j + 0.5) * GRID.deg) * DEG2RAD
		cosRow[j] = Math.cos(lat)
		fRow[j] = coriolisScale * Math.sin(lat)
		const latFace = (-90 + (j + 1) * GRID.deg) * DEG2RAD
		cosFace[j] = Math.cos(latFace)
		fFace[j] = coriolisScale * Math.sin(latFace)
		const a = eps / (eps * eps + fRow[j] * fRow[j])
		diag[j] =
			1 + waveCoupling * a * (2 / (d * d * cosRow[j] * cosRow[j]) + 2 / (d * d))
	}

	const phi = Float32Array.from(P0)
	const uFace = new Float32Array(lonBins * latBins)
	const vcFace = new Float32Array(lonBins * latBins)
	const east = new Int32Array(lonBins)
	const west = new Int32Array(lonBins)
	for (let i = 0; i < lonBins; i++) {
		east[i] = (i + 1) % lonBins
		west[i] = (i - 1 + lonBins) % lonBins
	}

	for (let iter = 0; iter < ITERATIONS; iter++) {
		for (let j = 0; j < latBins; j++) {
			const f = fRow[j]
			const inv = 1 / (eps * eps + f * f)
			const c = cosRow[j]
			const row = j * lonBins
			const up = (j < latBins - 1 ? j + 1 : j) * lonBins
			const down = (j > 0 ? j - 1 : j) * lonBins
			for (let i = 0; i < lonBins; i++) {
				const ie = east[i]
				const phiX = (phi[row + ie] - phi[row + i]) / (d * c)
				const phiY =
					(phi[up + i] - phi[down + i] + phi[up + ie] - phi[down + ie]) /
					(4 * d)
				uFace[row + i] = -(eps * phiX + f * phiY) * inv
			}
		}
		for (let j = 0; j < latBins - 1; j++) {
			const f = fFace[j]
			const inv = 1 / (eps * eps + f * f)
			const c = cosFace[j]
			const row = j * lonBins
			const up = row + lonBins
			for (let i = 0; i < lonBins; i++) {
				const ie = east[i]
				const iw = west[i]
				const phiY = (phi[up + i] - phi[row + i]) / d
				const phiX =
					(phi[row + ie] - phi[row + iw] + phi[up + ie] - phi[up + iw]) /
					(4 * d * c)
				vcFace[row + i] = -(eps * phiY - f * phiX) * inv * c
			}
		}
		let maxChange = 0
		for (let j = 0; j < latBins; j++) {
			const c = cosRow[j]
			const row = j * lonBins
			for (let i = 0; i < lonBins; i++) {
				const idx = row + i
				const uE = uFace[idx]
				const uW = uFace[row + west[i]]
				const vN = j < latBins - 1 ? vcFace[idx] : 0
				const vS = j > 0 ? vcFace[idx - lonBins] : 0
				const div = ((uE - uW) / d + (vN - vS) / d) / c
				const residual = P0[idx] - waveCoupling * div - phi[idx]
				const change = (RELAX * residual) / diag[j]
				phi[idx] += change
				if (Math.abs(change) > maxChange) maxChange = Math.abs(change)
			}
		}
		if (maxChange < TOLERANCE) break
	}
	return { lonBins, latBins, values: phi }
}

function correction({
	latDeg,
	lonDeg,
	pressure,
	friction,
	coriolisScale,
	waveCoupling,
}: DynamicCorrectionInput): Float32Array {
	const forcing = GRID.build({ latDeg, lonDeg, values: pressure })
	const solved = solve({ forcing, friction, coriolisScale, waveCoupling })
	const delta = new Float32Array(solved.values.length)
	for (let idx = 0; idx < delta.length; idx++) {
		delta[idx] = solved.values[idx] - forcing.values[idx]
	}
	return GRID.sample({
		grid: { lonBins: solved.lonBins, latBins: solved.latBins, values: delta },
		latDeg,
		lonDeg,
	})
}

export const DYNAMICS = {
	correction,
}
