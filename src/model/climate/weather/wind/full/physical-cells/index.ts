import { DYNAMICS } from "@/model/climate/weather/wind/dynamics"
import { FULL_WIND } from "@/model/climate/weather/wind/full"
import type {
	HeldHouHadleyWidthInput,
	RhinesEddyWidthInput,
	RossbyEddyWidthInput,
	SmoothLongitudeInput,
	TropopauseHeightInput,
} from "@/model/climate/weather/wind/full/physical-cells/types"
import type {
	CellBoundariesGenerator,
	CellPressureAtBoundaryGenerator,
	LargeScaleSolver,
} from "@/model/climate/weather/wind/full/types"
import type { ComputeWindVectorsInput } from "@/model/climate/weather/wind/types"
import { MATH } from "@/model/shared/math/core"

// Same full atmospheric model as FULL_WIND (torque balance, boundary flow,
// katabatic/orographic terrain response) but with the pressure template's
// cell STRUCTURE derived from physics instead of the fixed 6-boundary
// template (wind/full/index.ts's cellBoundariesTable): Held & Hou (1980) for
// the Hadley cell's own width, then the Rhines scale for how many narrower
// baroclinic bands fit between the Hadley edge and the pole. The Rossby
// deformation radius sets the zonal scale instead: per-longitude boundary
// shifts follow the thermal-equator fields smoothed over ~L_R, so fast
// rotators keep patchy stationary structure and slow ones go axisymmetric.
// All three react to rotation rate (and, for Hadley width, the world's own
// equator-pole temperature contrast) the way real atmospheres do -- a fast
// rotator packs in more, narrower bands; a slow one collapses toward one.
// Standalone experiment, not wired into the pipeline -- see
// src/test/earth/wind-physical-cells-rotation.smoke.test.ts for the
// rotation-reactivity checks this model is actually held to; it is not
// expected to beat FULL_WIND's Earth-comparison accuracy.

// Fixed Earth-like atmosphere: this climate model has no vertical structure
// (single-level per-cell temperature), so static stability and scale height
// can't be derived per-planet honestly. Gravity is likewise not otherwise
// modelled per-planet.
const SCALE_HEIGHT_M = 8000
const BRUNT_VAISALA_S = 0.01
const GRAVITY_M_S2 = 9.81
const HELD_HOU_COEFFICIENT = 5 / 3
// Pure Held-Hou assumes an inviscid, angular-momentum-conserving cell with no
// eddies; real (and this model's own) extratropical baroclinic eddies
// transport momentum poleward and interrupt the circulation before it
// reaches that limit, widening the actual cell. Calibrated so Earth rotation
// (24h) with an Earth-like 40K equator-pole contrast lands near the
// empirically-tuned hadleyWidth(24)=30deg still used by wind/full/wind/simple.
const CIRCULATION_EFFICIENCY = 1.8
const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
// Safety cap on extratropical bands -- physically this is never approached
// (Earth-like rotation needs ~2-3), it only guards against a pathological
// input driving the loop toward the pole in vanishingly small steps.
const MAX_EXTRATROPICAL_BANDS = 20
const MIN_HADLEY_WIDTH_DEG = 5
const MAX_HADLEY_WIDTH_DEG = 85
// Held-Hou's sqrt() needs a positive equator-pole contrast; a world with an
// inverted or near-zero zonal gradient still needs a well-defined cell.
const MIN_DELTA_THETA_K = 1

function heldHouHadleyWidthDeg({
	omega,
	planetRadiusM,
	deltaThetaK,
	theta0K,
}: HeldHouHadleyWidthInput): number {
	const deltaTheta = Math.max(MIN_DELTA_THETA_K, deltaThetaK)
	const radians =
		CIRCULATION_EFFICIENCY *
		Math.sqrt(
			(HELD_HOU_COEFFICIENT * GRAVITY_M_S2 * SCALE_HEIGHT_M * deltaTheta) /
				(omega * omega * planetRadiusM * planetRadiusM * theta0K),
		)
	return Math.min(
		MAX_HADLEY_WIDTH_DEG,
		Math.max(MIN_HADLEY_WIDTH_DEG, radians * RAD2DEG),
	)
}

function rossbyEddyWidthDeg({
	omega,
	latDeg,
	planetRadiusM,
}: RossbyEddyWidthInput): number {
	const f = Math.max(2 * omega * Math.sin(Math.abs(latDeg) * DEG2RAD), 1e-8)
	const deformationRadiusM = (BRUNT_VAISALA_S * SCALE_HEIGHT_M) / f
	return (deformationRadiusM / planetRadiusM) * RAD2DEG
}

// Eddy velocity scale from thermal wind at a 45-degree reference latitude:
// U ~ g H dT / (f a theta0) with the world's own equator-pole contrast as
// the meridional gradient. Earth numbers land near 15 m/s. Clamped because
// the linear scaling breaks for near-zero rotation, where drag saturates
// real eddy speeds; the Hadley cap already owns that regime anyway.
const MIN_URMS_MS = 1
const MAX_URMS_MS = 60
function thermalWindURms({
	omega,
	planetRadiusM,
	deltaThetaK,
	theta0K,
}: HeldHouHadleyWidthInput): number {
	const deltaTheta = Math.max(MIN_DELTA_THETA_K, deltaThetaK)
	const f45 = Math.max(2 * omega * Math.sin(45 * DEG2RAD), 1e-8)
	const u =
		(GRAVITY_M_S2 * SCALE_HEIGHT_M * deltaTheta) /
		(f45 * planetRadiusM * theta0K)
	return MATH.clamp({ value: u, lo: MIN_URMS_MS, hi: MAX_URMS_MS })
}

// Rhines scale sqrt(U/beta): the jet-spacing scale where turbulent energy
// piles into zonal jets. beta vanishes at the pole, so bands widen
// poleward into one broad polar cap instead of fragmenting the way a pure
// deformation-radius tiling does. Boundaries alternate ridge/trough, so
// boundary spacing is half a Rhines wavelength: pi * sqrt(U/beta). Earth
// numbers give ~26 deg at the Hadley edge, landing the subpolar trough
// near 55 deg and recovering the classic 3-belt structure at 24h.
const RHINES_HALF_WAVELENGTH = Math.PI
function rhinesEddyWidthDeg({
	omega,
	latDeg,
	planetRadiusM,
	uRmsMs,
}: RhinesEddyWidthInput): number {
	const beta = Math.max(
		(2 * omega * Math.cos(Math.abs(latDeg) * DEG2RAD)) / planetRadiusM,
		1e-15,
	)
	return (
		((RHINES_HALF_WAVELENGTH * Math.sqrt(uRmsMs / beta)) / planetRadiusM) *
		RAD2DEG
	)
}

// Mirrors the fixed template's per-boundary thermal-equator coupling: the
// trough follows the local thermal equator fully, outer boundaries barely.
const TEQ_COUPLING = 0.35

function smoothPeriodicLon({
	values,
	halfWindowBins,
}: SmoothLongitudeInput): Float32Array {
	const n = values.length
	const out = new Float32Array(n)
	for (let i = 0; i < n; i++) {
		let sum = 0
		for (let d = -halfWindowBins; d <= halfWindowBins; d++) {
			sum += values[(((i + d) % n) + n) % n]
		}
		out[i] = sum / (2 * halfWindowBins + 1)
	}
	return out
}

// Pressure-template amplitude, replacing wind/full's hand-fit
// DIRECT/INDIRECT/POLAR_CELL_PRESSURE_PER_C constants (0.22/0.22/0.15).
//
// The tempting first guess is to make this rotation-dependent via thermal
// wind (dU/d(ln p) = (R/f)*dT/dy): stronger f, weaker implied shear for the
// same dT. But that shear feeds into SURFACE_BALANCE.balance downstream,
// which is *also* an f-dependent conversion (pressure gradient -> wind).
// Composing the two, f cancels: the pressure contrast that makes the
// downstream geostrophic balance reproduce the thermal-wind-implied wind
// speed for a given dT works out to roughly rho*R*dT*ln(p_surface/p_top),
// independent of rotation. Making it explicitly f-dependent here would
// double-count Coriolis, once in the pressure step and again in the balance
// step that already exists.
//
// What actually distinguishes direct/indirect/polar cells isn't rotation --
// it's each cell type's effective vertical depth. A real atmosphere's
// tropopause is ~16-17km at the equator (deep, vigorous Hadley overturning)
// and ~8-9km at the poles (shallow); Ferrel/polar cells sit in the shallower
// part of that range. So the per-degree-C amplitude is scaled by a
// climatological tropopause-height profile evaluated at the cell's own
// latitude, instead of three unrelated fitted numbers.
const TROPOPAUSE_EQUATOR_M = 16500
const TROPOPAUSE_POLE_M = 9000
// Calibrated once (see wind-physical-cells-rotation.smoke.test.ts and the
// Earth comparison) so the k=1 (Hadley) amplitude at Earth's own tropopause
// height lands near DIRECT_CELL_PRESSURE_PER_C=0.22: the Hadley mid-cell
// tropopause is ~16000 m, and 0.22 / 16000 = 1.375e-5.
const PRESSURE_PER_C_SCALE = 1.4e-5

function tropopauseHeightM({ latDeg }: TropopauseHeightInput): number {
	// Smooth equator-to-pole falloff; real tropopause height drops more
	// sharply near 30-40 deg than a plain cosine, but a used-elsewhere shape
	// (cos^2, already the falloff MATH.smoothstep-adjacent code in this
	// domain favours for latitude profiles) keeps this a one-constant-pair
	// climatological input rather than another fitted curve.
	const c = Math.cos(latDeg * DEG2RAD)
	return TROPOPAUSE_POLE_M + (TROPOPAUSE_EQUATOR_M - TROPOPAUSE_POLE_M) * c * c
}

// Computed directly from contrastFromTrough (the trough-to-boundary gap),
// not accumulated from previousPressureAt: with many narrow physically-
// derived cells, alternating-sign increments accumulated step-by-step
// telescope-cancel (each new term is comparable in size to, and opposes,
// the one before it, so the running sum barely moves) -- confirmed directly:
// re-deriving this same set of boundaries with the old cumulative-from-
// neighbor formula produced boundaryBase values oscillating in a narrow
// 0.5-1.5 band, while contrastFromTrough grows toward the pole regardless
// of cell count, giving amplitude comparable to the standard template's.
const thermalWindPressurePerC: CellPressureAtBoundaryGenerator = ({
	k,
	cellCollapse,
	latPrev,
	latK,
	contrastFromTrough,
}): number => {
	const midLatDeg = (Math.abs(latPrev) + Math.abs(latK)) / 2
	const magnitude =
		PRESSURE_PER_C_SCALE * tropopauseHeightM({ latDeg: midLatDeg })
	let perC: number
	if (k === 1) perC = magnitude
	else if (k === 2) perC = -magnitude
	else perC = k % 2 === 1 ? magnitude : -magnitude
	// Collapsed circulation: every cell is thermally direct, so pressure rises
	// monotonically from the thermal equator to the cold pole -- collapse
	// toward this latitude's own direct-cell magnitude rather than a single
	// global constant, since the magnitude is now latitude-dependent.
	const blended = (1 - cellCollapse) * perC + cellCollapse * magnitude
	return blended * contrastFromTrough
}

// One row of boundary offsets, shared as the base width profile: the Hadley
// width from Held-Hou, then Rhines-scale bands outward. Per-longitude
// variation is applied on top in the generator, not here, so this stays a
// pure function of rotation and contrast for the reactivity test.
function physicalBoundaryRow({
	omega,
	planetRadiusM,
	deltaThetaK,
	theta0K,
}: HeldHouHadleyWidthInput): number[] {
	const offsets = [
		heldHouHadleyWidthDeg({ omega, planetRadiusM, deltaThetaK, theta0K }),
	]
	const uRmsMs = thermalWindURms({
		omega,
		planetRadiusM,
		deltaThetaK,
		theta0K,
	})
	for (let i = 0; i < MAX_EXTRATROPICAL_BANDS; i++) {
		const cumulative = offsets[offsets.length - 1]
		const eddyWidthDeg = rhinesEddyWidthDeg({
			omega,
			latDeg: cumulative,
			planetRadiusM,
			uRmsMs,
		})
		const next = cumulative + eddyWidthDeg
		if (next >= 90) break
		offsets.push(next)
	}
	return offsets
}

const physicalCellBoundaries: CellBoundariesGenerator = ({
	teqByLon,
	ridgeTeqByLon,
	hoursPerDay,
	planetRadiusKm,
	latBinMean,
}) => {
	const omega = (2 * Math.PI) / (hoursPerDay * 3600)
	const planetRadiusM = planetRadiusKm * 1000
	const bins = latBinMean.length
	// Equator bin sits at the array midpoint (LAT_BINS spans -90..90); pole
	// bins are the two ends. Average the poles so a hemispherically lopsided
	// climate still gives one well-defined equator-pole contrast.
	const equatorC = latBinMean[Math.floor(bins / 2)]
	const poleC = (latBinMean[0] + latBinMean[bins - 1]) / 2
	const deltaThetaK = equatorC - poleC
	let sum = 0
	for (let i = 0; i < bins; i++) sum += latBinMean[i]
	const theta0K = sum / bins + 273.15

	const row = physicalBoundaryRow({
		omega,
		planetRadiusM,
		deltaThetaK,
		theta0K,
	})
	// Zonal structure lives at the deformation scale: smooth the
	// thermal-equator fields over ~L_R before letting boundaries follow them,
	// so the stationary pattern is patchy on fast rotators and washes out
	// toward axisymmetry as rotation slows.
	const lonBins = teqByLon.length
	const rossbyRefDeg = rossbyEddyWidthDeg({
		omega,
		latDeg: 45,
		planetRadiusM,
	})
	const halfWindowBins = MATH.clamp({
		value: Math.round((rossbyRefDeg * lonBins) / 360),
		lo: 1,
		hi: 18,
	})
	const teqSmooth = smoothPeriodicLon({
		values: teqByLon,
		halfWindowBins,
	})
	const ridgeSmooth = smoothPeriodicLon({
		values: ridgeTeqByLon,
		halfWindowBins,
	})
	const stride = row.length
	const offsets = new Float32Array(lonBins * 2 * stride)
	for (let bin = 0; bin < lonBins; bin++) {
		for (let h = 0; h < 2; h++) {
			const hemisphere = h === 1 ? 1 : -1
			const rowStart = (bin * 2 + h) * stride
			let lo = 0
			for (let k = 0; k < stride; k++) {
				const coupling = TEQ_COUPLING ** (k + 1)
				const shifted =
					row[k] + hemisphere * (coupling * ridgeSmooth[bin] - teqSmooth[bin])
				const hi = Math.max(lo + 1, shifted)
				offsets[rowStart + k] = hi
				lo = hi
			}
		}
	}
	return { offsets, boundaryCount: stride + 1 }
}

const dynamicsSolver: LargeScaleSolver = ({
	latDeg,
	lonDeg,
	pressure,
	coriolisSign,
	omegaRatio,
}) => {
	return DYNAMICS.surfaceWind({
		latDeg,
		lonDeg,
		pressure,
		coriolisScale: coriolisSign * omegaRatio,
	})
}

function computeWindVectors(input: ComputeWindVectorsInput): {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
} {
	return FULL_WIND.computeWindVectorsWithLargeScale({
		...input,
		largeScaleSolver: dynamicsSolver,
		cellBoundariesGenerator: physicalCellBoundaries,
		cellPressureAtBoundaryGenerator: thermalWindPressurePerC,
	})
}

export const PHYSICAL_CELLS_WIND = {
	computeWindVectors,
	// Exposed for the rotation-reactivity test: lets it check the model's own
	// derived Hadley width/band count directly against hoursPerDay, without
	// building a full world per rotation rate just to read it back out of a
	// pressure field.
	boundaryRowDeg: physicalBoundaryRow,
	// Exposed so diagnostics can mix-and-match this model's structure/
	// amplitude generators against the standard ones independently (isolating
	// which one explains an accuracy gap), the way computeWindVectors combines
	// both by default.
	cellBoundariesGenerator: physicalCellBoundaries,
	cellPressureAtBoundaryGenerator: thermalWindPressurePerC,
}
