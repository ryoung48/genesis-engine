import type {
	LockedCirculation,
	LockedCirculationParams,
} from "@/model/climatev2/circulation/locked/types"
import { orbitOf } from "@/model/climatev2/vendor/insolation.js"
import { surfaceWind } from "@/model/climatev2/vendor/pressure.js"
import { HelmholtzSolver } from "@/model/climatev2/vendor/solver.js"

const MONTHS = 12
const SAMPLES = 12
const DEG = Math.PI / 180
const SEA_LEVEL_HPA = 1013.25
const KELVIN = 273.15
// A warm column holds less air above the ground: the surface pressure falls with the column's warming, taken as half
// the surface's anomaly (the column warms less aloft than at the ground)
const COLUMN_WARMING_SHARE = 0.5
// (a near-zero damping keeps the potential's solve well posed: the planet's mean of the source is removed first)
const POTENTIAL_DAMPING = 1e-4
const POTENTIAL_CYCLES = 30

// Under the even air of a locked planet the surface air flows in to where the ground heats the column more than the
// planet's mean and rises there (the rain stage's ascent): an irrotational inflow, u = ∇φ with ∇²φ = −(S − S̄), its
// shape from the sunlight the surface takes and its speed the planet's mean surface wind
function estimate({
	ctx,
	temperature,
}: LockedCirculationParams): LockedCirculation {
	const { grid, surface, options } = ctx
	const surf = temperature.lockedSurf
	const G = grid.size
	const { w, h } = grid
	const u = new Float32Array(MONTHS * G)
	const v = new Float32Array(MONTHS * G)
	const slp = new Float32Array(MONTHS * G)
	const orbit = orbitOf(options)
	const surfaceHPa = SEA_LEVEL_HPA * orbit.pressureScale
	const solver = new HelmholtzSolver(grid, 1, 1)
	const zero = new Float64Array(G)
	solver.setOperator(
		new Float64Array(G).fill(POTENTIAL_DAMPING),
		zero,
		null,
		null,
		0,
	)
	const source = new Float64Array(G)
	const phi = new Float64Array(G)
	const phiI = new Float64Array(G)
	const speed = surfaceWind(orbit)
	for (let m = 0; m < MONTHS; m++) {
		const off = m * G
		let tSum = 0
		let area = 0
		for (let c = 0; c < G; c++) {
			const wj = grid.rowArea[Math.floor(c / w)]
			tSum += wj * temperature.monthlySL[off + c]
			area += wj
		}
		const tMean = tSum / area
		for (let c = 0; c < G; c++)
			slp[off + c] =
				surfaceHPa -
				(surfaceHPa *
					COLUMN_WARMING_SHARE *
					(temperature.monthlySL[off + c] - tMean)) /
					(tMean + KELVIN)
		if (!surf) continue
		const o = (m % SAMPLES) * G
		let sun = 0
		for (let c = 0; c < G; c++) {
			const f = surface.landFrac[c]
			source[c] = f * surf.sunLand[o + c] + (1 - f) * surf.sunSea[o + c]
			sun += grid.rowArea[Math.floor(c / w)] * source[c]
		}
		for (let c = 0; c < G; c++) source[c] -= sun / area
		solver.solve(source, zero, phi, phiI, {
			maxCycles: POTENTIAL_CYCLES,
			tol: 1e-4,
		})
		let mean = 0
		for (let j = 0; j < h; j++) {
			const cl = Math.max(0.05, Math.cos(grid.lat[j] * DEG))
			for (let i = 0; i < w; i++) {
				const c = j * w + i
				const east = phi[j * w + ((i + 1) % w)] - phi[j * w + ((i - 1 + w) % w)]
				const north =
					(j > 0 ? phi[c - w] : phi[c]) - (j < h - 1 ? phi[c + w] : phi[c])
				u[off + c] = east / cl
				v[off + c] = north
				mean += grid.rowArea[j] * Math.hypot(u[off + c], v[off + c])
			}
		}
		const scale = mean > 0 ? (speed * area) / mean : 0
		for (let c = 0; c < G; c++) {
			u[off + c] *= scale
			v[off + c] *= scale
		}
	}
	return { u, v, slp }
}

export const CLIMATEV2_LOCKED_CIRCULATION = { estimate }
