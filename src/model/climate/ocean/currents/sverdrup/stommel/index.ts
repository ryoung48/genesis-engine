import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import type {
	ApplyOperatorParams,
	BuildOperatorParams,
	SolveStommelParams,
	StommelOperator,
	StommelSolution,
} from "@/model/climate/ocean/currents/sverdrup/stommel/types"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const ROW_COS = SVERDRUP_RASTER.rowCos
const DEG2RAD = Math.PI / 180
const wrapColumn = SVERDRUP_RASTER.wrapColumn

// Linear drag closes the vorticity budget and its Stommel layer R/beta is the
// western boundary current's width. A physical layer (~50 km on Earth) is far
// narrower than a 1-degree cell, so the boundary current would fall inside
// grid noise; the drag is set to make that layer this many cells wide, which
// is a resolution floor rather than a physical claim. Written against the
// planet's own rotation and the raster's own spacing -- dx beta = 2 Omega
// dlambda cos^2(lat) -- so it follows both.
const STOMMEL_LAYER_CELLS = 2
const REFERENCE_COS_SQ = 0.5

const MAX_ITERATIONS = 2000
const RELATIVE_TOLERANCE = 1e-4

// Jacobi is a weak preconditioner for an operator this close to a Laplacian.
// Symmetric Gauss-Seidel sweeps cost about one matrix-vector product each but
// buy back far more than that in iteration count.
const PRECONDITIONER_SWEEPS = 1

// R lap(psi) + J(psi, f) = curl(tau) / rho, with J(psi, f) = beta d(psi)/dx.
// Five-point, centred: the cell Peclet number is dx / (R / beta), which the
// drag above fixes at 1 / STOMMEL_LAYER_CELLS, so centred differencing stays
// well inside its stability limit of 2 and no upwinding is needed.
function build({ ocean, planet }: BuildOperatorParams): StommelOperator {
	const indexOf = new Int32Array(CELLS).fill(-1)
	let count = 0
	for (let j = 1; j < H - 1; j++)
		for (let i = 0; i < W; i++) {
			const idx = j * W + i
			if (ocean[idx]) indexOf[idx] = count++
		}

	const cellOf = new Int32Array(count)
	for (let idx = 0; idx < CELLS; idx++)
		if (indexOf[idx] >= 0) cellOf[indexOf[idx]] = idx

	const diagonal = new Float64Array(count)
	const east = new Float64Array(count)
	const west = new Float64Array(count)
	const north = new Float64Array(count)
	const south = new Float64Array(count)
	const neighborEast = new Int32Array(count)
	const neighborWest = new Int32Array(count)
	const neighborNorth = new Int32Array(count)
	const neighborSouth = new Int32Array(count)

	const dy = planet.radiusM * DEG2RAD
	const drag =
		STOMMEL_LAYER_CELLS *
		2 *
		planet.rotationRateRadS *
		DEG2RAD *
		REFERENCE_COS_SQ

	for (let k = 0; k < count; k++) {
		const idx = cellOf[k]
		const j = Math.floor(idx / W)
		const i = idx - j * W
		const dx = dy * ROW_COS[j]
		const beta =
			(planet.coriolisSign *
				2 *
				planet.rotationRateRadS *
				Math.cos((j - 90) * DEG2RAD)) /
			planet.radiusM
		const lateral = drag / (dx * dx)
		const meridional = drag / (ROW_COS[j] * dy * dy)
		const cosNorth = (ROW_COS[j] + ROW_COS[j + 1]) / 2
		const cosSouth = (ROW_COS[j] + ROW_COS[j - 1]) / 2
		const advection = beta / (2 * dx)

		east[k] = lateral + advection
		west[k] = lateral - advection
		north[k] = meridional * cosNorth
		south[k] = meridional * cosSouth
		diagonal[k] = -(2 * lateral + meridional * (cosNorth + cosSouth))

		// A land neighbour is psi = 0, so its term simply drops; the diagonal is
		// untouched, which is what makes the coast a Dirichlet boundary.
		neighborEast[k] = indexOf[j * W + wrapColumn(i + 1)]
		neighborWest[k] = indexOf[j * W + wrapColumn(i - 1)]
		neighborNorth[k] = indexOf[idx + W]
		neighborSouth[k] = indexOf[idx - W]
	}

	return {
		count,
		cellOf,
		diagonal,
		east,
		west,
		north,
		south,
		neighborEast,
		neighborWest,
		neighborNorth,
		neighborSouth,
	}
}

function apply({ operator, source, destination }: ApplyOperatorParams): void {
	const {
		count,
		diagonal,
		east,
		west,
		north,
		south,
		neighborEast,
		neighborWest,
		neighborNorth,
		neighborSouth,
	} = operator
	for (let k = 0; k < count; k++) {
		let value = diagonal[k] * source[k]
		const e = neighborEast[k]
		if (e >= 0) value += east[k] * source[e]
		const w = neighborWest[k]
		if (w >= 0) value += west[k] * source[w]
		const n = neighborNorth[k]
		if (n >= 0) value += north[k] * source[n]
		const s = neighborSouth[k]
		if (s >= 0) value += south[k] * source[s]
		destination[k] = value
	}
}

// Approximate A y = rhs by symmetric Gauss-Seidel, starting from zero.
function precondition(params: {
	operator: StommelOperator
	rhs: Float64Array
	out: Float64Array
}): void {
	const { operator, rhs, out } = params
	const {
		count,
		diagonal,
		east,
		west,
		north,
		south,
		neighborEast,
		neighborWest,
		neighborNorth,
		neighborSouth,
	} = operator
	out.fill(0)
	const relax = (k: number) => {
		let sum = rhs[k]
		const e = neighborEast[k]
		if (e >= 0) sum -= east[k] * out[e]
		const w = neighborWest[k]
		if (w >= 0) sum -= west[k] * out[w]
		const n = neighborNorth[k]
		if (n >= 0) sum -= north[k] * out[n]
		const s = neighborSouth[k]
		if (s >= 0) sum -= south[k] * out[s]
		out[k] = sum / diagonal[k]
	}
	for (let sweep = 0; sweep < PRECONDITIONER_SWEEPS; sweep++) {
		for (let k = 0; k < count; k++) relax(k)
		for (let k = count - 1; k >= 0; k--) relax(k)
	}
}

const dot = (a: Float64Array, b: Float64Array) => {
	let sum = 0
	for (let k = 0; k < a.length; k++) sum += a[k] * b[k]
	return sum
}

const norm = (a: Float64Array) => Math.sqrt(dot(a, a))

// BiCGSTAB with Jacobi preconditioning. The advection term makes the operator
// non-symmetric, so conjugate gradients does not apply.
function solve({
	operator,
	curl,
	planet,
	guess,
}: SolveStommelParams): StommelSolution {
	const { count, cellOf } = operator
	const forcingScale = planet.gyreStrength / planet.seawaterDensityKgM3

	const b = new Float64Array(count)
	for (let k = 0; k < count; k++) b[k] = forcingScale * curl[cellOf[k]]

	const x = new Float64Array(count)
	if (guess) x.set(guess)

	const r = new Float64Array(count)
	const shadow = new Float64Array(count)
	const p = new Float64Array(count)
	const v = new Float64Array(count)
	const s = new Float64Array(count)
	const t = new Float64Array(count)
	const y = new Float64Array(count)
	const z = new Float64Array(count)

	apply({ operator, source: x, destination: v })
	for (let k = 0; k < count; k++) r[k] = b[k] - v[k]
	shadow.set(r)

	const target = RELATIVE_TOLERANCE * Math.max(norm(b), 1e-300)
	let residual = norm(r)
	let iterations = 0
	let rho = 1
	let alpha = 1
	let omega = 1
	v.fill(0)
	p.fill(0)

	while (iterations < MAX_ITERATIONS && residual > target) {
		iterations++
		const rhoNext = dot(shadow, r)
		if (rhoNext === 0) break
		const beta = (rhoNext / rho) * (alpha / omega)
		rho = rhoNext
		for (let k = 0; k < count; k++) p[k] = r[k] + beta * (p[k] - omega * v[k])
		precondition({ operator, rhs: p, out: y })
		apply({ operator, source: y, destination: v })
		const shadowV = dot(shadow, v)
		if (shadowV === 0) break
		alpha = rho / shadowV
		for (let k = 0; k < count; k++) s[k] = r[k] - alpha * v[k]
		if (norm(s) <= target) {
			for (let k = 0; k < count; k++) x[k] += alpha * y[k]
			residual = norm(s)
			break
		}
		precondition({ operator, rhs: s, out: z })
		apply({ operator, source: z, destination: t })
		const tt = dot(t, t)
		if (tt === 0) break
		omega = dot(t, s) / tt
		for (let k = 0; k < count; k++) x[k] += alpha * y[k] + omega * z[k]
		for (let k = 0; k < count; k++) r[k] = s[k] - omega * t[k]
		residual = norm(r)
		if (omega === 0) break
	}

	const psi = new Float32Array(CELLS)
	for (let k = 0; k < count; k++) psi[cellOf[k]] = x[k]
	return {
		psi,
		state: x,
		iterations,
		residual: residual / Math.max(norm(b), 1e-300),
	}
}

export const STOMMEL = {
	build,
	solve,
}
