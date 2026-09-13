import { RAIN } from "@/model/climate/precipitation/rain"
import { SURFACE_BALANCE } from "@/model/climate/weather/wind/surface-balance"
import type {
	BalanceSideParams,
	ComponentWinds,
	ComponentWindsParams,
	HadleyScales,
	HadleyScalesParams,
	HemisphereTorqueParams,
} from "@/model/climate/weather/wind/torque-balance/types"

const MIN_HADLEY_SCALE = 0.5
const MAX_HADLEY_SCALE = 3
// Illinois-modified regula falsi: on this smooth, monotonic torque curve it
// converges superlinearly (typically a handful of steps to below tolerance),
// while still bracketing the root like bisection does, so a stalled step
// can't diverge outside [lo, hi] the way unguarded secant/Newton could.
const ROOT_STEPS_MAX = 20
const ROOT_BRACKET_TOLERANCE = 1e-6
const BALANCE_ROUNDS = 2

function componentWinds({
	mesh,
	pressure,
	coriolis,
	friction,
}: ComponentWindsParams): ComponentWinds {
	const N = mesh.numRegions
	const gradient = SURFACE_BALANCE.meshGradient({ mesh, field: pressure })
	const u = new Float32Array(N)
	const v = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const wind = SURFACE_BALANCE.balance({
			friction,
			coriolis: coriolis[r],
			forceEast: -gradient.east[r],
			forceNorth: -gradient.north[r],
		})
		u[r] = wind.u
		v[r] = wind.v
	}
	return { u, v }
}

// Net axial torque the surface wind exerts on one hemisphere: stress
// ~ sqrt(|U|^2 + gust^2) u, with storm gustiness adding drag the mean wind
// alone does not carry; lever arm and area both ~ cos(lat).
function hemisphereTorque({
	rest,
	north,
	south,
	weight,
	hemisphere,
	gust,
	scales,
	side,
}: HemisphereTorqueParams): number {
	let torque = 0
	for (let r = 0; r < weight.length; r++) {
		if (hemisphere[r] !== side) continue
		const u = rest.u[r] + scales.north * north.u[r] + scales.south * south.u[r]
		const v = rest.v[r] + scales.north * north.v[r] + scales.south * south.v[r]
		torque += weight[r] * Math.sqrt(u * u + v * v + gust[r] * gust[r]) * u
	}
	return torque
}

// Stronger Hadley pressure means stronger easterly trades and a more negative
// torque, so find the scale where this hemisphere's torque vanishes.
function balanceSide({ scales, side, ...components }: BalanceSideParams) {
	const torqueAt = (scale: number) =>
		hemisphereTorque({
			...components,
			scales:
				side > 0
					? { north: scale, south: scales.south }
					: { north: scales.north, south: scale },
			side,
		})
	let lo = MIN_HADLEY_SCALE
	let hi = MAX_HADLEY_SCALE
	let fLo = torqueAt(lo)
	if (fLo <= 0) return lo
	let fHi = torqueAt(hi)
	if (fHi >= 0) return hi
	// `stall` tracks which side has repeated without the bracket moving on the
	// other side; the Illinois correction halves that side's function value so
	// regula falsi can't stagnate against a flat end of the bracket.
	let stall = 0
	for (let step = 0; step < ROOT_STEPS_MAX; step++) {
		if (hi - lo < ROOT_BRACKET_TOLERANCE) break
		const mid = (fLo * hi - fHi * lo) / (fLo - fHi)
		const fMid = torqueAt(mid)
		if (fMid === 0) return mid
		if (fMid > 0) {
			lo = mid
			fLo = fMid
			if (stall === 1) fHi *= 0.5
			stall = 1
		} else {
			hi = mid
			fHi = fMid
			if (stall === -1) fLo *= 0.5
			stall = -1
		}
	}
	return (lo + hi) / 2
}

// In steady state the atmosphere exerts no net torque on the planet, so the
// easterly surface drag of the trades must balance the westerly drag of the
// midlatitudes. The template's Hadley amplitude comes from the weak tropical
// temperature contrast and cannot know that, so each hemisphere's Hadley
// pressure is rescaled until its surface torque vanishes.
function hadleyScales({
	mesh,
	rest,
	north,
	south,
	coriolis,
	friction,
	hemisphere,
	gust,
}: HadleyScalesParams): HadleyScales {
	const { cosLat } = RAIN.getClimateGeometry(mesh)
	const weight = new Float32Array(mesh.numRegions)
	for (let r = 0; r < weight.length; r++)
		weight[r] = mesh.regionArea[r] * cosLat[r]
	const components = {
		rest: componentWinds({ mesh, pressure: rest, coriolis, friction }),
		north: componentWinds({ mesh, pressure: north, coriolis, friction }),
		south: componentWinds({ mesh, pressure: south, coriolis, friction }),
		weight,
		hemisphere,
		gust,
	}
	let scales: HadleyScales = { north: 1, south: 1 }
	for (let round = 0; round < BALANCE_ROUNDS; round++) {
		scales = {
			north: balanceSide({ ...components, scales, side: 1 }),
			south: scales.south,
		}
		scales = {
			north: scales.north,
			south: balanceSide({ ...components, scales, side: -1 }),
		}
	}
	return scales
}

export const TORQUE_BALANCE = {
	hadleyScales,
}
