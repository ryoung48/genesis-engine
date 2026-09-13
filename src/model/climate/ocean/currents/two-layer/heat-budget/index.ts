import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import type {
	ComputeEffectiveLayerParams,
	EffectiveLayer,
	InterfaceVelocityParams,
	StepLayerParams,
} from "@/model/climate/ocean/currents/two-layer/heat-budget/types"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const ROW_COS = SVERDRUP_RASTER.rowCos
const DEG2RAD = Math.PI / 180
const wrapColumn = SVERDRUP_RASTER.wrapColumn

const EDDY_DIFFUSIVITY_M2_S = 2000
const MAX_SWEEPS = 80
const RESIDUAL_TOLERANCE = 2e-2
const RESIDUAL_CHECK_INTERVAL = 5

// Entrainment: when the mixed layer deepens, it mixes layer-2 water in,
// diluting layer 1 toward layer 2's temperature. Only layer 1's own equation
// uses this (see two-layer/index.ts) -- shoaling doesn't dilute layer 1,
// since it stays well-mixed at whatever temperature it already has.
function entrainmentVelocityMS({
	mixedLayerDepthM,
	previousMixedLayerDepthM,
	dtSeconds,
}: InterfaceVelocityParams): Float32Array {
	const out = new Float32Array(mixedLayerDepthM.length)
	for (let i = 0; i < mixedLayerDepthM.length; i++) {
		const dh = (mixedLayerDepthM[i] - previousMixedLayerDepthM[i]) / dtSeconds
		out[i] = Math.max(0, dh)
	}
	return out
}

// Detrainment capture: when the mixed layer shoals, the departing slab of
// water -- still carrying layer 1's own temperature at that moment, since
// layer 1 was well-mixed -- is left behind and folds into layer 2. This is
// the real re-emergence mechanism an earlier entrainment-only version of
// this model was missing (see src/test/earth/ocean-currents.md). Layer 2
// relaxes toward T1 at this rate on EITHER deepening or shoaling -- it gains
// heat from layer 1 by entrainment mixing across the interface, or by
// capturing the departing slab, and both look the same from layer 2's side:
// relaxation toward T1 at the interface's own speed, |dh1/dt|. Only layer
// 1's side of the coupling depends on direction (see entrainmentVelocityMS).
function exchangeVelocityMS({
	mixedLayerDepthM,
	previousMixedLayerDepthM,
	dtSeconds,
}: InterfaceVelocityParams): Float32Array {
	const out = new Float32Array(mixedLayerDepthM.length)
	for (let i = 0; i < mixedLayerDepthM.length; i++)
		out[i] =
			Math.abs(mixedLayerDepthM[i] - previousMixedLayerDepthM[i]) / dtSeconds
	return out
}

// Folds a layer's coupling to the OTHER layer into a modified relaxation
// time and source term: dT/dt = source - T/tau - (coupling/h)*(T-target)
// becomes, backward-Euler, dT/dt = source_eff - T/tau_eff with
// 1/tau_eff = 1/tau + coupling/h, source_eff = source + (coupling/h)*target.
// Used for BOTH layers (layer 1 couples to layer 2 via entrainmentVelocityMS
// and vice versa via exchangeVelocityMS -- see two-layer/index.ts), each
// with its own flow field, so each layer is a genuine spatial
// advection-diffusion solve (stepLayer below), not just a local relaxation.
// This makes layer 2 able to physically transport a captured anomaly along
// its own current, not just store it in place -- the capability entrainment/
// detrainment capture alone didn't have, since a purely local reservoir can
// only retain whatever heat already showed up in a given column; it can't
// import the heat a column's own source term never generated in the first
// place, which is what a real subsurface pathway (e.g. Gulf Stream
// extension water reaching N Atlantic Drift) does.
function computeEffectiveLayer({
	source,
	couplingVelocityMS,
	layerDepthM,
	relaxationSeconds,
	couplingTarget,
}: ComputeEffectiveLayerParams): EffectiveLayer {
	const N = source.length
	const outSource = new Float32Array(N)
	const outRelax = new Float32Array(N)
	for (let i = 0; i < N; i++) {
		const coupling = couplingVelocityMS[i] / layerDepthM[i]
		const relaxRate = 1 / relaxationSeconds[i] + coupling
		outRelax[i] = 1 / relaxRate
		outSource[i] = source[i] + coupling * couplingTarget[i]
	}
	return { source: outSource, relaxationSeconds: outRelax }
}

// One backward-Euler timestep of a layer's advection-diffusion-relaxation
// equation, five-point upwind, solved by Gauss-Seidel -- structurally the
// same discretization the (since-reverted) single-layer prognostic
// experiment used. Layer-agnostic: called once per layer per substep (see
// two-layer/index.ts), each with its own flow field and effective
// relaxation/source from computeEffectiveLayer above.
function stepLayer({
	flow,
	ocean,
	source,
	planet,
	relaxationSeconds,
	previous,
	dtSeconds,
}: StepLayerParams): Float32Array {
	const dy = planet.radiusM * DEG2RAD
	const coefWest = new Float32Array(CELLS)
	const coefEast = new Float32Array(CELLS)
	const coefSouth = new Float32Array(CELLS)
	const coefNorth = new Float32Array(CELLS)
	const diagonal = new Float32Array(CELLS)
	for (let j = 1; j < H - 1; j++) {
		const base = j * W
		const dx = dy * ROW_COS[j]
		const diffusionX = EDDY_DIFFUSIVITY_M2_S / (dx * dx)
		const diffusionY = EDDY_DIFFUSIVITY_M2_S / (dy * dy)
		for (let i = 0; i < W; i++) {
			const idx = base + i
			if (!ocean[idx]) continue
			const u = flow.x[idx]
			const v = flow.y[idx]
			if (ocean[base + wrapColumn(i - 1)])
				coefWest[idx] = Math.max(0, u) / dx + diffusionX
			if (ocean[base + wrapColumn(i + 1)])
				coefEast[idx] = Math.max(0, -u) / dx + diffusionX
			if (j > 1 && ocean[idx - W])
				coefSouth[idx] = Math.max(0, v) / dy + diffusionY
			if (j < H - 2 && ocean[idx + W])
				coefNorth[idx] = Math.max(0, -v) / dy + diffusionY
			diagonal[idx] =
				1 / dtSeconds +
				1 / relaxationSeconds[idx] +
				coefWest[idx] +
				coefEast[idx] +
				coefSouth[idx] +
				coefNorth[idx]
		}
	}

	const rhs = new Float32Array(CELLS)
	for (let idx = 0; idx < CELLS; idx++)
		if (ocean[idx]) rhs[idx] = source[idx] + previous[idx] / dtSeconds

	let rhsNorm = 0
	for (let i = 0; i < CELLS; i++) if (ocean[i]) rhsNorm += rhs[i] * rhs[i]
	rhsNorm = Math.sqrt(rhsNorm)
	const target = RESIDUAL_TOLERANCE * Math.max(rhsNorm, 1e-300)

	const next = previous.slice()
	for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
		const reverseRows = (sweep & 1) === 1
		const reverseColumns = (sweep & 2) === 2
		for (let jj = 1; jj < H - 1; jj++) {
			const j = reverseRows ? H - 1 - jj : jj
			const base = j * W
			for (let ii = 0; ii < W; ii++) {
				const i = reverseColumns ? W - 1 - ii : ii
				const idx = base + i
				if (!ocean[idx]) continue
				next[idx] =
					(rhs[idx] +
						coefWest[idx] * next[base + wrapColumn(i - 1)] +
						coefEast[idx] * next[base + wrapColumn(i + 1)] +
						coefSouth[idx] * next[idx - W] +
						coefNorth[idx] * next[idx + W]) /
					diagonal[idx]
			}
		}
		if ((sweep + 1) % RESIDUAL_CHECK_INTERVAL !== 0) continue
		let residualSq = 0
		for (let j = 1; j < H - 1; j++) {
			const base = j * W
			for (let i = 0; i < W; i++) {
				const idx = base + i
				if (!ocean[idx]) continue
				const applied =
					diagonal[idx] * next[idx] -
					coefWest[idx] * next[base + wrapColumn(i - 1)] -
					coefEast[idx] * next[base + wrapColumn(i + 1)] -
					coefSouth[idx] * next[idx - W] -
					coefNorth[idx] * next[idx + W]
				residualSq += (rhs[idx] - applied) ** 2
			}
		}
		if (Math.sqrt(residualSq) < target) break
	}
	return next
}

export const TWO_LAYER_HEAT_BUDGET = {
	entrainmentVelocityMS,
	exchangeVelocityMS,
	computeEffectiveLayer,
	stepLayer,
}
