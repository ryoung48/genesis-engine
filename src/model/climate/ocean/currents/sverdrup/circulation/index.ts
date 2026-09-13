import { SVERDRUP_COASTLINE } from "@/model/climate/ocean/currents/sverdrup/circulation/coastline"
import type { CoastlineGeometry } from "@/model/climate/ocean/currents/sverdrup/circulation/coastline/types"
import type {
	BaroclinicParams,
	Circulation,
	CurlParams,
	EkmanParams,
	EkmanResult,
	Forcing,
	ForcingParams,
	GeostrophicParams,
	SurfaceCurrentParams,
	SurfaceParams,
	WindStressParams,
} from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import type { RasterVector } from "@/model/climate/ocean/currents/sverdrup/raster/types"
import { THERMOCLINE } from "@/model/climate/ocean/currents/sverdrup/thermocline"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const ROW_COS = SVERDRUP_RASTER.rowCos
const DEG2RAD = Math.PI / 180
const wrapColumn = SVERDRUP_RASTER.wrapColumn

const STRESS_SMOOTHING_PASSES = 2

// Bulk-formula drag for wind stress over open water.
const AIR_DRAG_COEFFICIENT = 1.3e-3

// Ekman transport ~ tau / (rho f) is capped equatorward of this latitude, and
// the surface drift turns from wind-aligned at the equator to 45 degrees off
// it. The drift speed is the transport spread over the Ekman layer.
const EKMAN_MIN_LAT_DEG = 8
const EKMAN_DRIFT_ANGLE_DEG = 45
const EKMAN_DEPTH_M = 50

const MAX_SURFACE_SPEED_MS = 2

// Steric height anomaly from the mixed layer's own SST anomaly, eta' = beta_T
// T' h -- warm water expands, so a warm anomaly raises the surface the same
// way a deep thermocline does. Geostrophy converts its gradient into a
// current the same way it converts psi's gradient into the wind-driven one;
// this is what lets the density front an upwelling zone creates drive its own
// equatorward jet, which the wind-only balance has no way to produce.
const THERMAL_EXPANSION_PER_K = 2e-4
const GRAVITY_M_S2 = 9.81

// Coastal upwelling from wind piling Ekman transport against a wall is a
// different mechanism from open-ocean Ekman pumping, not just a stronger
// version of it -- curl(tau)/(rho f) is undefined at a wall, and the raw
// finite-difference divergence used for the open-ocean case only sees the
// coast at all because land is zeroed out, which under-resolves it at this
// grid's ~100km cells (real coastal-upwelling bands are 20-50km wide). Near
// the coast this replaces that finite-difference estimate with the transport
// actually being forced through a 50km-wide strip -- a literal physical
// width from the real process, not fit to any region's SST.
const COASTAL_BOUNDARY_LAYER_WIDTH_M = 50_000

// Coastline geometry only depends on the ocean mask, which never changes
// across a world's months or feedback passes, so it is cached by reference
// rather than recomputed on every surface() call.
const coastlineCache = new WeakMap<Uint8Array, CoastlineGeometry>()
function coastlineFor(ocean: Uint8Array): CoastlineGeometry {
	let geometry = coastlineCache.get(ocean)
	if (!geometry) {
		geometry = SVERDRUP_COASTLINE.build({ ocean })
		coastlineCache.set(ocean, geometry)
	}
	return geometry
}

function windStress({ index, wind, planet }: WindStressParams): RasterVector {
	const N = wind.windU.length
	const stressPerSpeedSq = planet.airDensityKgM3 * AIR_DRAG_COEFFICIENT
	const tauX = new Float32Array(N)
	const tauY = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const stress = stressPerSpeedSq * wind.windSpeed[r] * wind.windSpeed[r]
		tauX[r] = stress * wind.windU[r]
		tauY[r] = stress * wind.windV[r]
	}
	return {
		x: SVERDRUP_RASTER.smooth({
			field: SVERDRUP_RASTER.average({ index, values: tauX, include: null }),
			mask: null,
			passes: STRESS_SMOOTHING_PASSES,
		}),
		y: SVERDRUP_RASTER.smooth({
			field: SVERDRUP_RASTER.average({ index, values: tauY, include: null }),
			mask: null,
			passes: STRESS_SMOOTHING_PASSES,
		}),
	}
}

// Vertical curl of the wind stress, Pa/m.
function curl({ tau, planet }: CurlParams): Float32Array {
	const metersPerDeg = planet.radiusM * DEG2RAD
	const out = new Float32Array(CELLS)
	for (let j = 1; j < H - 1; j++) {
		const base = j * W
		for (let i = 0; i < W; i++) {
			const dTauYdLon =
				(tau.y[base + wrapColumn(i + 1)] - tau.y[base + wrapColumn(i - 1)]) / 2
			const dTauXCosdLat =
				(tau.x[base + W + i] * ROW_COS[j + 1] -
					tau.x[base - W + i] * ROW_COS[j - 1]) /
				2
			out[base + i] = (dTauYdLon - dTauXCosdLat) / (ROW_COS[j] * metersPerDeg)
		}
	}
	return out
}

// Surface speed of the gyre: u = -d(psi)/dy / h, v = d(psi)/dx / h, with
// psi = 0 on land. The transport rides in the reduced-gravity upper layer, so
// the layer's own thickness converts it to a speed and a subtropical gyre
// centre, where the thermocline bows down, runs slower than its transport
// alone suggests. Where the layer thins past its at-rest thickness it no
// longer confines the flow, which goes barotropic, so that is the floor.
function geostrophic({
	psi,
	ocean,
	depth,
	planet,
}: GeostrophicParams): RasterVector {
	const metersPerDeg = planet.radiusM * DEG2RAD
	const x = new Float32Array(CELLS)
	const y = new Float32Array(CELLS)
	const at = (idx: number) => (ocean[idx] ? psi[idx] : 0)
	for (let j = 1; j < H - 1; j++) {
		const base = j * W
		for (let i = 0; i < W; i++) {
			const idx = base + i
			if (!ocean[idx]) continue
			const layer = Math.max(depth[idx], THERMOCLINE.easternDepthM)
			y[idx] =
				(at(base + wrapColumn(i + 1)) - at(base + wrapColumn(i - 1))) /
				(2 * metersPerDeg * ROW_COS[j] * layer)
			x[idx] = -(at(idx + W) - at(idx - W)) / (2 * metersPerDeg * layer)
		}
	}
	return { x, y }
}

// Geostrophic flow from the SST anomaly's own steric height gradient, u =
// (g/f) d(eta')/dy, v = -(g/f) d(eta')/dx -- the sign opposite the textbook
// surface thermal-wind relation. The straight sign drove the coastal jet
// backwards against the observed eastern-boundary currents (measured: worse
// direction skill and a weaker cold anomaly at California/Benguela/Humboldt);
// this is because the real density-driven response to a coastal cold front is
// a subsurface poleward undercurrent, not a surface addition, and this model
// has no depth to put that undercurrent in -- adding the textbook sign at the
// surface fights the wind-driven equatorward flow instead of the undercurrent
// fighting it below. Flipping it is an empirical correction for that missing
// vertical structure, not a rederivation; it measurably helps every
// eastern-boundary region (direction and SST both) and nothing else moves.
// Land is treated as eta' = 0, the same Dirichlet simplification psi uses at
// the coast. f is floored at the same latitude Ekman transport is, since
// thermal wind also blows up at the equator.
function baroclinic({ sst, ocean, planet }: BaroclinicParams): RasterVector {
	const metersPerDeg = planet.radiusM * DEG2RAD
	const twoOmega = 2 * planet.rotationRateRadS
	const minF = twoOmega * Math.sin(EKMAN_MIN_LAT_DEG * DEG2RAD)
	const scale = GRAVITY_M_S2 * THERMAL_EXPANSION_PER_K * MIXED_LAYER.depthM
	const x = new Float32Array(CELLS)
	const y = new Float32Array(CELLS)
	const at = (idx: number) => (ocean[idx] ? sst[idx] : 0)
	for (let j = 1; j < H - 1; j++) {
		const base = j * W
		const lat = j - 90
		const fSign = planet.coriolisSign * Math.sign(lat)
		const fMagnitude = Math.max(
			Math.abs(twoOmega * Math.sin(lat * DEG2RAD)),
			minF,
		)
		const f = fSign * fMagnitude
		if (f === 0) continue
		for (let i = 0; i < W; i++) {
			const idx = base + i
			if (!ocean[idx]) continue
			y[idx] =
				-(
					scale *
					(at(base + wrapColumn(i + 1)) - at(base + wrapColumn(i - 1)))
				) /
				(f * 2 * metersPerDeg * ROW_COS[j])
			x[idx] = (scale * (at(idx + W) - at(idx - W))) / (f * 2 * metersPerDeg)
		}
	}
	return { x, y }
}

// Ekman transport M = k x tau / (rho f) (m^2/s, to the right of the wind
// where f > 0), zero on land, so its divergence (m/s) captures coastal
// upwelling (offshore transport against a wall), equatorial upwelling
// (transport diverging across the equator), and open-ocean Ekman pumping in
// one field.
function ekman({ tau, ocean, planet }: EkmanParams): EkmanResult {
	const twoOmega = 2 * planet.rotationRateRadS
	const minF = twoOmega * Math.sin(EKMAN_MIN_LAT_DEG * DEG2RAD)
	const rho = planet.seawaterDensityKgM3
	const mx = new Float32Array(CELLS)
	const my = new Float32Array(CELLS)
	const driftX = new Float32Array(CELLS)
	const driftY = new Float32Array(CELLS)
	for (let j = 0; j < H; j++) {
		const lat = j - 90
		const fSign = planet.coriolisSign * Math.sign(lat)
		const fMagnitude = Math.max(
			Math.abs(twoOmega * Math.sin(lat * DEG2RAD)),
			minF,
		)
		const transportScale = fSign / (rho * fMagnitude)
		const driftScale = 1 / (rho * fMagnitude * EKMAN_DEPTH_M)
		const angle =
			EKMAN_DRIFT_ANGLE_DEG *
			DEG2RAD *
			Math.min(1, Math.abs(lat) / EKMAN_MIN_LAT_DEG) *
			fSign
		const cosAngle = Math.cos(angle)
		const sinAngle = Math.sin(angle)
		for (let i = 0; i < W; i++) {
			const idx = j * W + i
			if (!ocean[idx]) continue
			const tx = tau.x[idx]
			const ty = tau.y[idx]
			mx[idx] = transportScale * ty
			my[idx] = -transportScale * tx
			driftX[idx] = (tx * cosAngle + ty * sinAngle) * driftScale
			driftY[idx] = (-tx * sinAngle + ty * cosAngle) * driftScale
		}
	}

	const metersPerDeg = planet.radiusM * DEG2RAD
	const divergence = new Float32Array(CELLS)
	for (let j = 1; j < H - 1; j++) {
		const base = j * W
		for (let i = 0; i < W; i++) {
			const idx = base + i
			if (!ocean[idx]) continue
			const dMxdLon =
				(mx[base + wrapColumn(i + 1)] - mx[base + wrapColumn(i - 1)]) / 2
			const dMyCosdLat =
				(my[idx + W] * ROW_COS[j + 1] - my[idx - W] * ROW_COS[j - 1]) / 2
			divergence[idx] = (dMxdLon + dMyCosdLat) / (ROW_COS[j] * metersPerDeg)
		}
	}

	// Blend toward the coastal-wall estimate near the coast (weight -> 1) and
	// leave the open-ocean curl-based estimate alone away from it (weight -> 0)
	// -- the two are the same physical quantity at different fidelity, not
	// separate terms to add, so this replaces rather than adds.
	const coastline = coastlineFor(ocean)
	for (let idx = 0; idx < CELLS; idx++) {
		const weight = coastline.weight[idx]
		if (!ocean[idx] || weight <= 0) continue
		const offshoreTransport =
			mx[idx] * coastline.normalX[idx] + my[idx] * coastline.normalY[idx]
		const coastalDivergence = offshoreTransport / COASTAL_BOUNDARY_LAYER_WIDTH_M
		divergence[idx] =
			divergence[idx] * (1 - weight) + coastalDivergence * weight
	}

	return { drift: { x: driftX, y: driftY }, divergence }
}

function addRasterVectors(a: RasterVector, b: RasterVector): RasterVector {
	const x = new Float32Array(CELLS)
	const y = new Float32Array(CELLS)
	for (let i = 0; i < CELLS; i++) {
		x[i] = a.x[i] + b.x[i]
		y[i] = a.y[i] + b.y[i]
	}
	return { x, y }
}

function surfaceCurrent({
	geostrophic: geo,
	drift,
	ocean,
}: SurfaceCurrentParams): RasterVector {
	const x = new Float32Array(CELLS)
	const y = new Float32Array(CELLS)
	for (let i = 0; i < CELLS; i++) {
		if (!ocean[i]) continue
		const u = geo.x[i] + drift.x[i]
		const v = geo.y[i] + drift.y[i]
		const speed = Math.hypot(u, v)
		const scale =
			speed > MAX_SURFACE_SPEED_MS ? MAX_SURFACE_SPEED_MS / speed : 1
		x[i] = u * scale
		y[i] = v * scale
	}
	return { x, y }
}

// The wind's contribution: stress and its curl. Split out from the surface
// step because the curl of all twelve months is needed before any of them can
// be solved -- see STOMMEL.solveSeasonal.
function forcing({ index, wind, planet }: ForcingParams): Forcing {
	const tau = windStress({ index, wind, planet })
	return { tau, curl: curl({ tau, planet }) }
}

// Everything downstream of psi. None of it is linear in psi -- the thermocline
// takes a square root, the surface speed divides by it and is capped -- so it
// stays per-month even though the psi solve itself is shared.
function surface({
	index,
	tau,
	psi,
	planet,
	sstAnomaly,
}: SurfaceParams): Circulation {
	const { ocean } = index
	const thermoclineDepth = THERMOCLINE.depth({ interior: psi, ocean, planet })
	const { drift, divergence } = ekman({ tau, ocean, planet })
	const wind = geostrophic({ psi, ocean, depth: thermoclineDepth, planet })
	const geo = sstAnomaly
		? addRasterVectors(wind, baroclinic({ sst: sstAnomaly, ocean, planet }))
		: wind
	return {
		flow: surfaceCurrent({ geostrophic: geo, drift, ocean }),
		divergence,
		thermoclineDepth,
	}
}

export const SVERDRUP_CIRCULATION = {
	forcing,
	surface,
}
