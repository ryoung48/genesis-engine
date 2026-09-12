import type {
	Circulation,
	CurlParams,
	EkmanParams,
	EkmanResult,
	GeostrophicParams,
	SolveCirculationParams,
	SurfaceCurrentParams,
	WindStressParams,
} from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import type { RasterVector } from "@/model/climate/ocean/currents/sverdrup/raster/types"
import { STOMMEL } from "@/model/climate/ocean/currents/sverdrup/stommel"
import { THERMOCLINE } from "@/model/climate/ocean/currents/sverdrup/thermocline"

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
	return { drift: { x: driftX, y: driftY }, divergence }
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

function solve({
	index,
	wind,
	planet,
	operator,
	guess,
}: SolveCirculationParams): Circulation {
	const { ocean } = index
	const tau = windStress({ index, wind, planet })
	const solution = STOMMEL.solve({
		operator,
		curl: curl({ tau, planet }),
		planet,
		guess,
	})
	const thermoclineDepth = THERMOCLINE.depth({
		interior: solution.psi,
		ocean,
		planet,
	})
	const { drift, divergence } = ekman({ tau, ocean, planet })
	return {
		flow: surfaceCurrent({
			geostrophic: geostrophic({
				psi: solution.psi,
				ocean,
				depth: thermoclineDepth,
				planet,
			}),
			drift,
			ocean,
		}),
		divergence,
		thermoclineDepth,
		solution,
	}
}

export const SVERDRUP_CIRCULATION = {
	solve,
}
