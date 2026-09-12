import type {
	BarrierMaskParams,
	ChannelJetParams,
	Circulation,
	CurlParams,
	EkmanParams,
	EkmanResult,
	GeostrophicParams,
	SolveCirculationParams,
	StreamfunctionParams,
	StreamfunctionResult,
	SurfaceCurrentParams,
	WesternBoundaryParams,
	WindStressParams,
} from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import type { RasterVector } from "@/model/climate/ocean/currents/sverdrup/raster/types"
import { THERMOCLINE } from "@/model/climate/ocean/currents/sverdrup/thermocline"
import { MATH } from "@/model/shared/math/core"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const ROW_COS = SVERDRUP_RASTER.rowCos
const DEG2RAD = Math.PI / 180
const wrapColumn = SVERDRUP_RASTER.wrapColumn

const STRESS_SMOOTHING_PASSES = 2

// psi is integrated along each row independently, with no meridional coupling,
// so neighbouring rows carry independent integration error -- and u = -dpsi/dy
// differentiates straight across it. Smoothing is what keeps that noise out of
// the zonal flow: 2 -> 4 passes is worth about +0.04 global direction, 2 -> 6
// about +0.06. The principled fix is a real 2-D inversion rather than a pass
// count; see ocean-currents.md.
const PSI_SMOOTHING_PASSES = 4

// Bulk-formula drag for wind stress over open water.
const AIR_DRAG_COEFFICIENT = 1.3e-3

// Sverdrup balance breaks down as beta -> 0 near the poles; psi tapers to
// zero across this band rather than stepping to it.
const POLAR_TAPER_START_DEG = 70
const POLAR_CUTOFF_DEG = 80

// Longest unbroken open-water run (degrees of longitude) at which a row
// starts / finishes behaving as a circumpolar channel instead of a basin.
const CHANNEL_ONSET_DEG = 180
const CHANNEL_FULL_DEG = 300

// Land runs narrower than this (in 1-degree cells) are islands the gyre flows
// around rather than basin walls -- unless they belong to a continent.
const MIN_BARRIER_CELLS = 3

// Lateral eddy viscosity setting the Munk western-boundary-layer width
// (A / beta)^(1/3), ~80 km on Earth; floored at one raster cell.
const MUNK_VISCOSITY_M2_S = 1e4

// Ekman transport ~ tau / (rho f) is capped equatorward of this latitude, and
// the surface drift turns from wind-aligned at the equator to 45 degrees off
// it. The drift speed is the transport spread over the Ekman layer.
const EKMAN_MIN_LAT_DEG = 8
const EKMAN_DRIFT_ANGLE_DEG = 45
const EKMAN_DEPTH_M = 50

// A zonally unblocked row has no walls to hold up a pressure gradient, so the
// zonal momentum the wind puts in cannot be stored as a gyre and is dissipated
// against the ocean below instead. Balancing the wind stress with a water-side
// quadratic drag, rho_w C_d u^2 = tau_x, leaves the channel jet the Sverdrup
// solution cannot produce: eastward under westerlies, and the only thing that
// gives a circumpolar current any net transport.
const OCEAN_DRAG_COEFFICIENT = 2.5e-3

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

function barrierMask({ ocean, continent }: BarrierMaskParams): Uint8Array {
	const barrier = new Uint8Array(CELLS)
	for (let j = 0; j < H; j++) {
		const base = j * W
		let start = -1
		for (let i = 0; i < W; i++) {
			if (ocean[base + i]) {
				start = i
				break
			}
		}
		if (start < 0) {
			barrier.fill(1, base, base + W)
			continue
		}
		let runStart = 0
		let runLength = 0
		for (let k = 1; k <= W; k++) {
			const i = wrapColumn(start + k)
			if (!ocean[base + i]) {
				if (runLength === 0) runStart = i
				runLength++
				continue
			}
			for (let m = 0; m < runLength; m++) {
				const idx = base + wrapColumn(runStart + m)
				if (runLength >= MIN_BARRIER_CELLS || continent[idx] > 0.5)
					barrier[idx] = 1
			}
			runLength = 0
		}
	}
	return barrier
}

function applyWesternBoundary({
	segment,
	boundary,
	widthCells,
	channelWeight,
}: WesternBoundaryParams): void {
	for (let s = 0; s < segment.length; s++) {
		const cellsFromWest = segment.length - 1 - s
		boundary[segment[s]] =
			1 - (1 - channelWeight) * Math.exp(-(cellsFromWest + 0.5) / widthCells)
	}
}

// Sverdrup transport streamfunction (m^3/s): d(psi)/dx = curl(tau) / (rho
// beta), integrated westward from each basin's eastern wall (psi = 0 there).
// With dx = a cos(lat) dlon and beta = 2 Omega cos(lat) / a the cos(lat)
// factors cancel, so every 1-degree step adds the same multiple of the curl.
// Rows start at a wall and wrap across the dateline so no basin is cut in
// two. A gyre needs walls to hold up its zonal pressure gradient: a row
// whose longest open-water run nearly circles the globe behaves like a
// circumpolar channel, so it blends toward the periodic solution to the
// zonally-detrended curl (pure channel where there is no wall at all).
function streamfunction({
	curl: curlTau,
	ocean,
	barrier,
	planet,
}: StreamfunctionParams): StreamfunctionResult {
	const metersPerDeg = planet.radiusM * DEG2RAD
	const psiPerCurl =
		(planet.gyreStrength *
			planet.coriolisSign *
			metersPerDeg *
			planet.radiusM) /
		(2 * planet.rotationRateRadS * planet.seawaterDensityKgM3)
	const raw = new Float32Array(CELLS)
	const channel = new Float32Array(H)
	const boundary = new Float32Array(CELLS).fill(1)
	const walled = new Float64Array(W)
	const periodic = new Float64Array(W)
	for (let j = 0; j < H; j++) {
		const absLat = Math.abs(j - 90)
		if (absLat > POLAR_CUTOFF_DEG) continue
		const base = j * W

		let meanCurl = 0
		for (let i = 0; i < W; i++) meanCurl += curlTau[base + i] / W
		let meanPsi = 0
		let psi = 0
		for (let i = W - 1; i >= 0; i--) {
			psi -= psiPerCurl * (curlTau[base + i] - meanCurl)
			periodic[i] = psi
			meanPsi += psi / W
		}
		for (let i = 0; i < W; i++) periodic[i] -= meanPsi

		let wall = -1
		for (let i = 0; i < W; i++) {
			if (barrier[base + i]) {
				wall = i
				break
			}
		}
		walled.fill(0)
		const segments: number[][] = []
		let longest = W
		if (wall >= 0) {
			let current: number[] = []
			psi = 0
			for (let k = 1; k < W; k++) {
				const i = wrapColumn(wall - k)
				if (barrier[base + i]) {
					if (current.length > 0) segments.push(current)
					current = []
					psi = 0
					continue
				}
				psi -= psiPerCurl * curlTau[base + i]
				walled[i] = psi
				current.push(base + i)
			}
			if (current.length > 0) segments.push(current)
			longest = 0
			for (const segment of segments)
				longest = Math.max(longest, segment.length)
		}

		const channelWeight = MATH.smoothstep({
			edge0: CHANNEL_ONSET_DEG,
			edge1: CHANNEL_FULL_DEG,
			x: longest,
		})
		const polarTaper =
			1 -
			MATH.smoothstep({
				edge0: POLAR_TAPER_START_DEG,
				edge1: POLAR_CUTOFF_DEG,
				x: absLat,
			})
		channel[j] = channelWeight * polarTaper
		for (let i = 0; i < W; i++)
			raw[base + i] =
				polarTaper *
				((1 - channelWeight) * walled[i] + channelWeight * periodic[i])

		const beta =
			(2 * planet.rotationRateRadS * Math.cos((j - 90) * DEG2RAD)) /
			planet.radiusM
		const munkWidthM = Math.cbrt(MUNK_VISCOSITY_M2_S / beta)
		const widthCells = Math.max(1, munkWidthM / (metersPerDeg * ROW_COS[j]))
		for (const segment of segments)
			applyWesternBoundary({ segment, boundary, widthCells, channelWeight })
	}

	const interior = SVERDRUP_RASTER.smooth({
		field: raw,
		mask: ocean,
		passes: PSI_SMOOTHING_PASSES,
	})
	const psi = new Float32Array(CELLS)
	for (let i = 0; i < CELLS; i++)
		if (ocean[i]) psi[i] = interior[i] * boundary[i]
	return { psi, interior, channel }
}

// Eastward jet of a circumpolar channel, from the row-mean zonal wind stress
// balanced against water-side quadratic drag.
function channelJet({ tau, ocean, channel, planet }: ChannelJetParams) {
	const out = new Float32Array(CELLS)
	const dragScale = planet.seawaterDensityKgM3 * OCEAN_DRAG_COEFFICIENT
	for (let j = 0; j < H; j++) {
		if (channel[j] <= 0) continue
		const base = j * W
		let sum = 0
		let count = 0
		for (let i = 0; i < W; i++) {
			if (!ocean[base + i]) continue
			sum += tau.x[base + i]
			count++
		}
		if (count === 0) continue
		const meanTau = sum / count
		const speed = Math.sqrt(Math.abs(meanTau) / dragScale)
		const jet = channel[j] * planet.gyreStrength * Math.sign(meanTau) * speed
		for (let i = 0; i < W; i++) if (ocean[base + i]) out[base + i] = jet
	}
	return out
}

// Surface speed of the gyre: u = -d(psi)/dy / h, v = d(psi)/dx / h, with
// psi = 0 on land. The transport rides in the reduced-gravity upper layer, so
// the layer's own thickness converts it to a speed and a subtropical gyre
// centre, where the thermocline bows down, runs slower than its transport
// alone suggests. Where the layer thins past its at-rest thickness -- subpolar
// gyres, the circumpolar channel -- it no longer confines the flow, which
// goes barotropic, so the at-rest thickness is the floor.
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
	jet,
	ocean,
}: SurfaceCurrentParams): RasterVector {
	const x = new Float32Array(CELLS)
	const y = new Float32Array(CELLS)
	for (let i = 0; i < CELLS; i++) {
		if (!ocean[i]) continue
		const u = geo.x[i] + drift.x[i] + jet[i]
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
	barrier,
	wind,
	planet,
}: SolveCirculationParams): Circulation {
	const { ocean } = index
	const tau = windStress({ index, wind, planet })
	const { psi, interior, channel } = streamfunction({
		curl: curl({ tau, planet }),
		ocean,
		barrier,
		planet,
	})
	const { drift, divergence } = ekman({ tau, ocean, planet })
	const thermoclineDepth = THERMOCLINE.depth({ interior, ocean, planet })
	return {
		flow: surfaceCurrent({
			geostrophic: geostrophic({
				psi,
				ocean,
				depth: thermoclineDepth,
				planet,
			}),
			drift,
			jet: channelJet({ tau, ocean, channel, planet }),
			ocean,
		}),
		interior,
		divergence,
		thermoclineDepth,
	}
}

export const SVERDRUP_CIRCULATION = {
	barrierMask,
	solve,
}
