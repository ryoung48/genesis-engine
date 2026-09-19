import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND as LOCKED_WIND } from "@/model/climate/weather/tidal-locked"
import { SIMPLE_WIND } from "@/model/climate/weather/wind/simple"
import type {
	ComputeWindVectorsInput,
	FlowGrid,
	RasterizeVectorGridInput,
	WindGrid,
} from "@/model/climate/weather/wind/types"
import type { SphereMesh } from "@/model/mesh/types"
import { MATH } from "@/model/shared/math/core"

function rasterizeVectorGrid({
	mesh,
	vectorU,
	vectorV,
	vectorSpeed,
	options = {},
}: RasterizeVectorGridInput): FlowGrid {
	const W = 360
	const H = 181
	const u = new Float32Array(W * H)
	const v = new Float32Array(W * H)
	const speed = new Float32Array(W * H)
	const cnt = new Int32Array(W * H)
	const scalar = options.scalar ? new Float32Array(W * H) : undefined
	const activeMask = options.allowCell ? new Uint8Array(W * H) : undefined
	const blockedVotes = options.isBlockedRegion
		? new Int16Array(W * H)
		: undefined

	const { latDeg, lonDeg } = RAIN.getClimateGeometry(mesh)
	const N = mesh.numRegions
	for (let r = 0; r < N; r++) {
		const li = Math.max(0, Math.min(H - 1, Math.round(latDeg[r] + 90)))
		const ci = Math.max(0, Math.min(W - 1, Math.round(lonDeg[r] + 180)))
		const idx = li * W + ci
		if (blockedVotes) blockedVotes[idx] += options.isBlockedRegion?.(r) ? 1 : -1
		if (options.allowCell && !options.allowCell(r)) continue
		u[idx] += vectorU[r]
		v[idx] += vectorV[r]
		speed[idx] += vectorSpeed[r]
		if (scalar) scalar[idx] += options.scalar?.[r] ?? 0
		cnt[idx]++
		if (activeMask) activeMask[idx] = 1
	}
	for (let i = 0; i < W * H; i++) {
		if (cnt[i] > 1) {
			u[i] /= cnt[i]
			v[i] /= cnt[i]
			speed[i] /= cnt[i]
			if (scalar) scalar[i] /= cnt[i]
		}
	}

	// 3 passes of neighbour diffusion to fill sparse polar/edge gaps
	const tmpU = u.slice()
	const tmpV = v.slice()
	const tmpS = speed.slice()
	const tmpScalar = scalar?.slice()
	for (let pass = 0; pass < 3; pass++) {
		for (let li = 0; li < H; li++) {
			for (let ci = 0; ci < W; ci++) {
				const idx = li * W + ci
				if (cnt[idx] > 0) continue
				if (blockedVotes && blockedVotes[idx] > 0) continue
				let su = 0,
					sv = 0,
					ss = 0,
					sc = 0,
					n = 0
				const neighbours = [
					[li - 1, ci],
					[li + 1, ci],
					[li, (ci - 1 + W) % W],
					[li, (ci + 1) % W],
				] as const
				for (const [nl, nc] of neighbours) {
					if (nl < 0 || nl >= H) continue
					const ni = nl * W + nc
					if (cnt[ni] > 0) {
						su += tmpU[ni]
						sv += tmpV[ni]
						ss += tmpS[ni]
						if (tmpScalar) sc += tmpScalar[ni] ?? 0
						n++
					}
				}
				if (n > 0) {
					u[idx] = su / n
					v[idx] = sv / n
					speed[idx] = ss / n
					if (scalar) scalar[idx] = sc / n
					cnt[idx] = 1
				}
			}
		}
		tmpU.set(u)
		tmpV.set(v)
		tmpS.set(speed)
		tmpScalar?.set(scalar ?? new Float32Array())
	}

	if (blockedVotes) {
		for (let i = 0; i < W * H; i++) {
			if (blockedVotes[i] <= 0) continue
			u[i] = 0
			v[i] = 0
			speed[i] = 0
			if (scalar) scalar[i] = 0
		}
	}

	return {
		u,
		v,
		speed,
		scalar,
		mask: activeMask,
		width: W as 360,
		height: H as 181,
	}
}

function computeWindGrid({
	mesh,
	windU,
	windV,
	windSpeed,
}: {
	mesh: SphereMesh
	windU: Float32Array
	windV: Float32Array
	windSpeed: Float32Array
}): WindGrid {
	return rasterizeVectorGrid({
		mesh,
		vectorU: windU,
		vectorV: windV,
		vectorSpeed: windSpeed,
	})
}

// Rotation's share of cell collapse: 0 for Earth-like rotation, 1 once the
// day is long enough that Coriolis no longer organises the circulation.
// Shared by the wind models and by the ocean gyres, which fade on the same
// signal. Anchored to the GCM staging: the polar cell is gone structurally
// by 4 days (the boundary table carries that, not this curve), and this
// curve fades the Ferrel-to-pole remnant from full strength at 4 days to
// nothing at 16 days, when a single Hadley cell dominates each hemisphere.
const COLLAPSE_HOURS_EDGE0 = 96
const COLLAPSE_HOURS_EDGE1 = 384
function rotationCollapse(hoursPerDay: number): number {
	return MATH.smoothstep({
		edge0: COLLAPSE_HOURS_EDGE0,
		edge1: COLLAPSE_HOURS_EDGE1,
		x: hoursPerDay,
	})
}

function computeWindVectors(input: ComputeWindVectorsInput): {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
} {
	if (input.params?.tideLock?.type === "solar") {
		return LOCKED_WIND.computeLockedWindVectors(input)
	}
	return SIMPLE_WIND.computeWindVectors(input)
}

/** Builds the same {windU, windV, pressure, windSpeed} shape as
 * computeWindVectors (windU/windV are unit direction vectors, windSpeed the
 * magnitude in m/s; pressure is unused for observed data and left zeroed)
 * but sourced from GenesisWorld.observedWind (NCEP/NCAR reanalysis, sampled
 * onto mesh regions by attachObservedEarthWind) instead of the procedural
 * pressure-gradient model -- lets the wind particle overlay render real
 * Earth wind for comparison/tuning against the model (see the "Wind" ->
 * "Observed (NCEP)" toggle in OverlayControls). */
function observedWindVectorsForMonth({
	observedWind,
	numRegions,
	month,
}: {
	observedWind:
		| { real_u_monthly?: Float32Array; real_v_monthly?: Float32Array }
		| undefined
	numRegions: number
	month?: number
}): {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
} {
	const windU = new Float32Array(numRegions)
	const windV = new Float32Array(numRegions)
	const pressure = new Float32Array(numRegions)
	const windSpeed = new Float32Array(numRegions)
	const realU = observedWind?.real_u_monthly
	const realV = observedWind?.real_v_monthly
	if (!realU || !realV) return { windU, windV, pressure, windSpeed }

	for (let r = 0; r < numRegions; r++) {
		let u: number
		let v: number
		if (month !== undefined && month >= 0 && month < 12) {
			u = realU[month * numRegions + r]
			v = realV[month * numRegions + r]
		} else {
			let uSum = 0
			let vSum = 0
			let count = 0
			for (let m = 0; m < 12; m++) {
				const uu = realU[m * numRegions + r]
				const vv = realV[m * numRegions + r]
				if (Number.isFinite(uu) && Number.isFinite(vv)) {
					uSum += uu
					vSum += vv
					count++
				}
			}
			u = count > 0 ? uSum / count : NaN
			v = count > 0 ? vSum / count : NaN
		}
		if (!Number.isFinite(u) || !Number.isFinite(v)) continue
		const speed = Math.hypot(u, v)
		windSpeed[r] = speed
		if (speed > 1e-9) {
			windU[r] = u / speed
			windV[r] = v / speed
		}
	}

	return { windU, windV, pressure, windSpeed }
}

export const WIND = {
	rasterizeVectorGrid,
	computeWindGrid,
	computeWindVectors,
	observedWindVectorsForMonth,
	rotationCollapse,
}
