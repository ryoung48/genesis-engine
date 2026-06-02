/**
 * Ocean current warmth model.
 *
 * Seeds warm/cold coastal ocean cells from continental coastline geometry plus
 * TEQ-relative latitude bands, then propagates that signal offshore and onto
 * nearby continental land.
 */

import type { OrogenClimate, OrogenParams, SphereMesh } from ".."
import { isRetrogradeObliquity, meanEdgeLengthKm } from "../shared/units"
import type { OrogenLandmarks } from "../terrain/landmarks"
import { computeThermalEquator, getClimateGeometry } from "./rain"

const DEG2RAD = Math.PI / 180
const TYPE_LAKE = 5
const CURRENT_EFFECT_MONTHS = 12
const TEQ_BINS = 120
const WARM_EFFECT_XS = [0, 20, 40, 60, 80]
const WARM_EFFECT_YS = [1, 2, 8, 15, 10]
const COLD_EFFECT_YS = [1, 2, 5, 10, 7]

interface OceanCurrentResult {
	/** Per-cell ocean warmth: -1 (cold) to +1 (warm). Zero for land. */
	oceanWarmth: Float32Array
	/** Per-cell diffused coastal warmth on land: -1..+1. Zero for ocean and deep interior. */
	coastalWarmth: Float32Array
	/** Optional flattened monthly ocean warmth, [month * N + r]. */
	oceanWarmthMonthly?: Float32Array
	/** Optional flattened monthly coastal warmth, [month * N + r]. */
	coastalWarmthMonthly?: Float32Array
	/** Optional flattened monthly temperature delta, [month * N + r]. */
	temperatureDeltaMonthly?: Float32Array
	/** Per-cell temperature delta applied by ocean currents (°C). Zero where no effect. */
	temperatureDelta: Float32Array
}

function piecewise(xs: number[], ys: number[], x: number): number {
	if (x <= xs[0]) return ys[0]
	for (let i = 1; i < xs.length; i++) {
		if (x <= xs[i]) {
			const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
			return ys[i - 1] + (ys[i] - ys[i - 1]) * t
		}
	}
	return ys[ys.length - 1]
}


function computeCoastalWarmthFromOceanWarmth(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isLake: Uint8Array,
	oceanWarmth: Float32Array,
	avgEdgeKm: number,
): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const coastalWarmth = new Float32Array(N)
	const landFadeHops = Math.max(4, Math.round(600 / avgEdgeKm))
	const landDist = new Int32Array(N).fill(-1)
	const landQueue = new Int32Array(N)
	let lqLen = 0
	let landHead = 0

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let warmSum = 0
		let oceanCount = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (!isLand[nb] && !isLake[nb]) {
				warmSum += oceanWarmth[nb]
				oceanCount++
			}
		}
		if (oceanCount === 0) continue
		coastalWarmth[r] = warmSum / oceanCount
		landDist[r] = 0
		landQueue[lqLen++] = r
	}

	while (landHead < lqLen) {
		const r = landQueue[landHead++]
		const d = landDist[r] + 1
		if (d >= landFadeHops) continue
		const fade = 1 - d / landFadeHops
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (isLand[nb] && landDist[nb] === -1) {
				landDist[nb] = d
				coastalWarmth[nb] = coastalWarmth[r] * fade
				landQueue[lqLen++] = nb
			}
		}
	}

	return coastalWarmth
}


/**
 * Sverdrup streamfunction on a 360×181 lat-lon grid.
 *
 * Integrates ψ east→west within each ocean basin (ψ = 0 at each eastern
 * boundary). Returns per-mesh-region ψ normalised to [-1, +1].
 *
 * Purely physical — no TEQ thresholds. TEQ-aware blending is the caller's job.
 */
function computeSverdrupPsi(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isLake: Uint8Array,
	windU: Float32Array,
	windV: Float32Array,
	windSpeed: Float32Array,
	latDeg: Float32Array,
	coriolisSign: number,
): Float32Array {
	const W = 360
	const H = 181
	const N = mesh.numRegions
	const { lonDeg } = getClimateGeometry(mesh)

	// Rasterise wind stress and ocean mask onto lat-lon grid
	const tauX = new Float32Array(W * H)
	const tauY = new Float32Array(W * H)
	const ocean = new Uint8Array(W * H)
	const cnt = new Int32Array(W * H)
	for (let r = 0; r < N; r++) {
		const li = Math.max(0, Math.min(H - 1, Math.round(latDeg[r] + 90)))
		const ci = Math.max(0, Math.min(W - 1, Math.round(lonDeg[r] + 180)))
		const idx = li * W + ci
		if (!isLand[r] && !isLake[r]) {
			tauX[idx] += windSpeed[r] * windU[r]
			tauY[idx] += windSpeed[r] * windV[r]
			ocean[idx] = 1
			cnt[idx]++
		}
	}
	for (let i = 0; i < W * H; i++) {
		if (cnt[i] > 1) { tauX[i] /= cnt[i]; tauY[i] /= cnt[i] }
	}

	// Fill grid gaps (3 diffusion passes)
	const tmpX = tauX.slice()
	const tmpY = tauY.slice()
	for (let pass = 0; pass < 3; pass++) {
		for (let j = 0; j < H; j++) {
			for (let i = 0; i < W; i++) {
				const idx = j * W + i
				if (cnt[idx] > 0) continue
				let sx = 0, sy = 0, n = 0
				if (j > 0 && cnt[(j - 1) * W + i] > 0) { sx += tmpX[(j - 1) * W + i]; sy += tmpY[(j - 1) * W + i]; n++ }
				if (j < H - 1 && cnt[(j + 1) * W + i] > 0) { sx += tmpX[(j + 1) * W + i]; sy += tmpY[(j + 1) * W + i]; n++ }
				const il = (i - 1 + W) % W, ir = (i + 1) % W
				if (cnt[j * W + il] > 0) { sx += tmpX[j * W + il]; sy += tmpY[j * W + il]; n++ }
				if (cnt[j * W + ir] > 0) { sx += tmpX[j * W + ir]; sy += tmpY[j * W + ir]; n++ }
				if (n > 0) { tauX[idx] = sx / n; tauY[idx] = sy / n; cnt[idx] = 1 }
			}
		}
		tmpX.set(tauX); tmpY.set(tauY)
	}

	// Smooth wind stress (4 passes)
	for (let pass = 0; pass < 4; pass++) {
		for (let j = 0; j < H; j++) {
			for (let i = 0; i < W; i++) {
				const idx = j * W + i
				let sx = tauX[idx], sy = tauY[idx], n = 1
				if (j > 0) { sx += tauX[(j - 1) * W + i]; sy += tauY[(j - 1) * W + i]; n++ }
				if (j < H - 1) { sx += tauX[(j + 1) * W + i]; sy += tauY[(j + 1) * W + i]; n++ }
				sx += tauX[j * W + (i - 1 + W) % W]; sy += tauY[j * W + (i - 1 + W) % W]; n++
				sx += tauX[j * W + (i + 1) % W]; sy += tauY[j * W + (i + 1) % W]; n++
				tmpX[idx] = sx / n; tmpY[idx] = sy / n
			}
		}
		tauX.set(tmpX); tauY.set(tmpY)
	}

	// Wind stress curl: ∂τy/∂x − ∂τx/∂y
	const curlTau = new Float32Array(W * H)
	for (let j = 1; j < H - 1; j++) {
		for (let i = 0; i < W; i++) {
			const ip = (i + 1) % W, im = (i - 1 + W) % W
			curlTau[j * W + i] =
				(tauY[j * W + ip] - tauY[j * W + im]) / 2 -
				(tauX[(j + 1) * W + i] - tauX[(j - 1) * W + i]) / 2
		}
	}

	// Sverdrup integration east → west on each latitude row.
	// β_proxy = coriolisSign * cos(lat); ψ[i] = ψ[i+1] − curl[i] / β.
	// ψ resets to 0 at each basin's eastern boundary (first ocean cell after land).
	const psiGrid = new Float32Array(W * H)
	for (let j = 0; j < H; j++) {
		const lat = j - 90
		const beta = coriolisSign * Math.cos(lat * DEG2RAD)
		if (Math.abs(beta) < 0.01) continue

		let psi = 0
		let prevLand = true
		for (let i = W - 1; i >= 0; i--) {
			const idx = j * W + i
			if (!ocean[idx]) {
				psi = 0; prevLand = true
			} else {
				if (prevLand) { psi = 0; prevLand = false }
				else { psi -= curlTau[idx] / beta }
				psiGrid[idx] = psi
			}
		}
	}

	// Smooth ψ over ocean (4 passes)
	const psiTmp = psiGrid.slice()
	for (let pass = 0; pass < 4; pass++) {
		for (let j = 0; j < H; j++) {
			for (let i = 0; i < W; i++) {
				const idx = j * W + i
				if (!ocean[idx]) continue
				let sum = psiGrid[idx], n = 1
				if (j > 0 && ocean[(j - 1) * W + i]) { sum += psiGrid[(j - 1) * W + i]; n++ }
				if (j < H - 1 && ocean[(j + 1) * W + i]) { sum += psiGrid[(j + 1) * W + i]; n++ }
				const il = (i - 1 + W) % W, ir = (i + 1) % W
				if (ocean[j * W + il]) { sum += psiGrid[j * W + il]; n++ }
				if (ocean[j * W + ir]) { sum += psiGrid[j * W + ir]; n++ }
				psiTmp[idx] = sum / n
			}
		}
		psiGrid.set(psiTmp)
	}

	// Normalise ψ by 90th-percentile |ψ| over ocean
	let nOcean = 0
	for (let i = 0; i < W * H; i++) if (ocean[i] && psiGrid[i] !== 0) nOcean++
	const absArr = new Float32Array(nOcean)
	let ai = 0
	for (let i = 0; i < W * H; i++) if (ocean[i] && psiGrid[i] !== 0) absArr[ai++] = Math.abs(psiGrid[i])
	absArr.sort()
	const p90 = absArr[Math.floor(0.9 * absArr.length)] ?? 1
	const psiScale = 1 / Math.max(p90, 1e-9)
	for (let i = 0; i < W * H; i++) psiGrid[i] = Math.max(-1, Math.min(1, psiGrid[i] * psiScale))

	// Meridional velocity v = ∂ψ/∂x (eastward derivative of streamfunction).
	// Large and poleward at western boundaries (Gulf Stream, Kuroshio, etc.);
	// small and equatorward in the interior (Sverdrup return flow).
	const vGrid = new Float32Array(W * H)
	for (let j = 0; j < H; j++) {
		for (let i = 0; i < W; i++) {
			const idx = j * W + i
			if (!ocean[idx]) continue
			const ip = (i + 1) % W, im = (i - 1 + W) % W
			if (ocean[j * W + ip] && ocean[j * W + im]) {
				vGrid[idx] = (psiGrid[j * W + ip] - psiGrid[j * W + im]) / 2
			} else if (ocean[j * W + ip]) {
				// Land to west: ψ = 0 at the boundary — central difference with ψ_west = 0
				vGrid[idx] = (psiGrid[j * W + ip] - 0) / 2
			} else if (ocean[j * W + im]) {
				// Land to east: ψ = 0 at the boundary — central difference with ψ_east = 0
				vGrid[idx] = (0 - psiGrid[j * W + im]) / 2
			}
		}
	}
	// Normalise v by its own 90th percentile
	let nv = 0
	for (let i = 0; i < W * H; i++) if (ocean[i] && vGrid[i] !== 0) nv++
	const vArr = new Float32Array(nv)
	let vi = 0
	for (let i = 0; i < W * H; i++) if (ocean[i] && vGrid[i] !== 0) vArr[vi++] = Math.abs(vGrid[i])
	vArr.sort()
	const vp90 = vArr[Math.floor(0.9 * vArr.length)] ?? 1
	const vScale = 1 / Math.max(vp90, 1e-9)
	for (let i = 0; i < W * H; i++) vGrid[i] = Math.max(-1, Math.min(1, vGrid[i] * vScale))

	// Map ψ and v back to mesh cells (nearest grid cell)
	const psiMesh = new Float32Array(N)
	const vMesh = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue
		const li = Math.max(0, Math.min(H - 1, Math.round(latDeg[r] + 90)))
		const ci = Math.max(0, Math.min(W - 1, Math.round(lonDeg[r] + 180)))
		psiMesh[r] = psiGrid[li * W + ci]
		vMesh[r] = vGrid[li * W + ci]
	}
	return { psiMesh, vMesh }
}

/**
 * Derive ocean warmth from Ekman pumping: curl(τ)/f.
 *
 * Downwelling (w_E < 0) → warm surface; upwelling (w_E > 0) → cold surface.
 * Replaces the coast-orientation heuristic with physics that works for any
 * continent configuration, rotation rate, or obliquity.
 */
function computeEkmanOceanWarmth(
	mesh: SphereMesh,
	isLand: Uint8Array,
	isLake: Uint8Array,
	windU: Float32Array,
	windV: Float32Array,
	windSpeed: Float32Array,
	latDeg: Float32Array,
	sinLat: Float32Array,
	edgeEastward: Float32Array,
	edgeNorthward: Float32Array,
	regionBin: Int32Array,
	teqByLon: Float32Array | undefined,
	coriolisSign: number,
): Float32Array {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh

	// Wind stress — linear in speed (pattern matters, not exact magnitude)
	const tauX = new Float32Array(N)
	const tauY = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		tauX[r] = windSpeed[r] * windU[r]
		tauY[r] = windSpeed[r] * windV[r]
	}

	// Smooth wind stress to reduce noise on irregular mesh (4 passes)
	const bufX = new Float32Array(N)
	const bufY = new Float32Array(N)
	for (let pass = 0; pass < 4; pass++) {
		for (let r = 0; r < N; r++) {
			let sx = tauX[r],
				sy = tauY[r],
				cnt = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				sx += tauX[adjList[j]]
				sy += tauY[adjList[j]]
				cnt++
			}
			bufX[r] = sx / cnt
			bufY[r] = sy / cnt
		}
		tauX.set(bufX)
		tauY.set(bufY)
	}

	// Ekman pumping proxy: curl(τ) / (coriolisSign * sinLat)
	// curl(τ) = ∂τy/∂east − ∂τx/∂north  (mesh gradient, same method as wind.ts)
	// Skip cells within ~5° of equator where sinLat ≈ 0
	const F_MIN = Math.abs(Math.sin(5 * DEG2RAD))
	const ekman = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue
		const fProxy = coriolisSign * sinLat[r]
		if (Math.abs(fProxy) < F_MIN) continue

		let dtauY_deast = 0,
			dtauX_dnorth = 0,
			cnt = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			dtauY_deast += (tauY[nb] - tauY[r]) * edgeEastward[j]
			dtauX_dnorth += (tauX[nb] - tauX[r]) * edgeNorthward[j]
			cnt++
		}
		if (cnt > 0) ekman[r] = (dtauY_deast - dtauX_dnorth) / (cnt * fProxy)
	}

	// Smooth Ekman over ocean only (4 passes; keeps land boundary clean)
	const buf = new Float32Array(N)
	for (let pass = 0; pass < 4; pass++) {
		for (let r = 0; r < N; r++) {
			if (isLand[r] || isLake[r]) continue
			let sum = ekman[r],
				cnt = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!isLand[nb] && !isLake[nb]) {
					sum += ekman[nb]
					cnt++
				}
			}
			buf[r] = sum / cnt
		}
		for (let r = 0; r < N; r++) {
			if (!isLand[r] && !isLake[r]) ekman[r] = buf[r]
		}
	}

	// Normalise by the 90th-percentile absolute value (robust to outliers)
	let absCount = 0
	for (let r = 0; r < N; r++) {
		if (!isLand[r] && !isLake[r] && ekman[r] !== 0) absCount++
	}
	const absVals = new Float32Array(absCount)
	let ai = 0
	for (let r = 0; r < N; r++) {
		if (!isLand[r] && !isLake[r] && ekman[r] !== 0)
			absVals[ai++] = Math.abs(ekman[r])
	}
	absVals.sort()
	const pct90 = absVals[Math.floor(0.9 * absVals.length)] ?? 1
	const scale = 1 / Math.max(pct90, 1e-9)

	// Build warmth field
	const warmth = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue

		const lat = latDeg[r]
		const teqRef = teqByLon ? teqByLon[regionBin[r]] : 0
		const distFromTeq = Math.abs(lat - teqRef)

		// Blend Ekman in smoothly — fade to zero within 15° of TEQ
		const eqWeight = distFromTeq < 5 ? 0 : distFromTeq < 15 ? (distFromTeq - 5) / 10 : 1
		// Downwelling (ekman < 0) → warm; upwelling (ekman > 0) → cold
		let w = Math.max(-1, Math.min(1, -ekman[r] * scale * eqWeight))

		// Tropical background warmth near TEQ
		if (distFromTeq < 10) {
			const t = 1 - distFromTeq / 10
			w = w + (0.5 - w) * (t * 0.5)
		}

		// Polar cold override
		if (distFromTeq > 65) {
			const t = Math.min(1, (distFromTeq - 65) / 15)
			const polarVal = -(0.35 + t * 0.55)
			w = w + (polarVal - w) * (t * 0.8)
		}

		warmth[r] = Math.max(-1, Math.min(1, w))
	}

	// Sverdrup gyre-transport correction.
	//
	// v * |ψ| is the key signal: v = ∂ψ/∂x is large and poleward at each basin's
	// western boundary (Gulf Stream, Kuroshio, Brazil, East Australian) and small
	// elsewhere; |ψ| gates the contribution so the eastern boundary (ψ = 0) is
	// unaffected. The additive formula preserves the Ekman base in the interior
	// while creating sharp warm/cold anomalies at the right coasts.
	//
	// coriolisSign * sign(lat) converts poleward/equatorward to warm/cold for all
	// hemisphere and rotation-direction combinations.
	const { psiMesh, vMesh } = computeSverdrupPsi(
		mesh, isLand, isLake, windU, windV, windSpeed, latDeg, coriolisSign,
	)
	for (let r = 0; r < N; r++) {
		if (isLand[r] || isLake[r]) continue
		const lat = latDeg[r]
		const teqRef = teqByLon ? teqByLon[regionBin[r]] : 0
		const dist = Math.abs(lat - teqRef)
		const distWeight =
			dist < 15 ? 0
			: dist < 25 ? (dist - 15) / 10
			: dist < 60 ? 1
			: dist < 70 ? (70 - dist) / 10
			: 0
		if (distWeight <= 0) continue
		const contrib =
			0.7 * distWeight * coriolisSign * Math.sign(lat) * vMesh[r] * Math.abs(psiMesh[r])
		warmth[r] = Math.max(-1, Math.min(1, warmth[r] + contrib))
	}

	// Final smoothing pass to remove remaining noise
	for (let pass = 0; pass < 4; pass++) {
		for (let r = 0; r < N; r++) {
			if (isLand[r] || isLake[r]) continue
			let sum = warmth[r],
				cnt = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!isLand[nb] && !isLake[nb]) {
					sum += warmth[nb]
					cnt++
				}
			}
			buf[r] = sum / cnt
		}
		for (let r = 0; r < N; r++) {
			if (!isLand[r] && !isLake[r])
				warmth[r] = Math.max(-1, Math.min(1, buf[r]))
		}
	}

	return warmth
}

/**
 * Compute ocean current warmth and diffused coastal warmth.
 *
 * Pipeline position: after computeTemperature and after an initial landmarks
 * pass on the pre-lake land mask.
 */
export function computeOceanCurrents(
	mesh: SphereMesh,
	isLand: Uint8Array,
	landmarks: OrogenLandmarks,
	params: Pick<OrogenParams, "planetRadiusKm" | "hoursPerDay" | "obliquity"> | undefined,
	monthlyTEQ: Float32Array[] | undefined,
	windU: Float32Array,
	windV: Float32Array,
	windSpeed: Float32Array,
	monthlyWind?: Array<{
		windU: Float32Array
		windV: Float32Array
		windSpeed: Float32Array
	}>,
): OceanCurrentResult {
	const N = mesh.numRegions
	const avgEdgeKm = meanEdgeLengthKm(mesh, params?.planetRadiusKm)
	const { latDeg, regionBin, sinLat, edgeEastward, edgeNorthward } =
		getClimateGeometry(mesh)

	const isLake = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		const landmark = landmarks.regionLandmark[r]
		if (landmark >= 0 && !isLand[r] && landmarks.type[landmark] === TYPE_LAKE)
			isLake[r] = 1
	}

	const coriolisSign = isRetrogradeObliquity(params?.obliquity ?? 0) ? -1 : 1

	// Annual mean TEQ for tropical/polar belt corrections
	let annualTeq: Float32Array | undefined
	if (monthlyTEQ && monthlyTEQ.length === CURRENT_EFFECT_MONTHS) {
		const bins = monthlyTEQ[0]!.length
		annualTeq = new Float32Array(bins)
		for (const teq of monthlyTEQ) {
			for (let i = 0; i < bins; i++) annualTeq[i] += teq[i]!
		}
		for (let i = 0; i < bins; i++) annualTeq[i] /= CURRENT_EFFECT_MONTHS
	}

	const oceanWarmth = computeEkmanOceanWarmth(
		mesh, isLand, isLake, windU, windV, windSpeed,
		latDeg, sinLat, edgeEastward, edgeNorthward,
		regionBin, annualTeq, coriolisSign,
	)

	const coastalWarmth = computeCoastalWarmthFromOceanWarmth(
		mesh, isLand, isLake, oceanWarmth, avgEdgeKm,
	)

	let oceanWarmthMonthly: Float32Array | undefined
	let coastalWarmthMonthly: Float32Array | undefined
	let temperatureDeltaMonthly: Float32Array | undefined
	if (monthlyTEQ && monthlyTEQ.length === CURRENT_EFFECT_MONTHS) {
		oceanWarmthMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
		coastalWarmthMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
		temperatureDeltaMonthly = new Float32Array(N * CURRENT_EFFECT_MONTHS)
		for (let month = 0; month < CURRENT_EFFECT_MONTHS; month++) {
			const mw = monthlyWind?.[month]
			const monthOceanWarmth = computeEkmanOceanWarmth(
				mesh, isLand, isLake,
				mw?.windU ?? windU, mw?.windV ?? windV, mw?.windSpeed ?? windSpeed,
				latDeg, sinLat, edgeEastward, edgeNorthward,
				regionBin, monthlyTEQ[month], coriolisSign,
			)
			oceanWarmthMonthly.set(monthOceanWarmth, month * N)
			coastalWarmthMonthly.set(
				computeCoastalWarmthFromOceanWarmth(mesh, isLand, isLake, monthOceanWarmth, avgEdgeKm),
				month * N,
			)
		}
	}

	return {
		oceanWarmth,
		coastalWarmth,
		oceanWarmthMonthly,
		coastalWarmthMonthly,
		temperatureDeltaMonthly,
		temperatureDelta: new Float32Array(N),
	}
}

/** 360×181 lat-lon raster consumed by the ocean current particle overlay. */
export interface OceanCurrentGrid {
	/** Eastward direction component (normalized) */
	u: Float32Array
	/** Northward direction component (normalized) */
	v: Float32Array
	/** SSTA warmth -1..+1 for particle coloring */
	warmth: Float32Array
	/** 1 = ocean, 0 = land/lake */
	isOcean: Uint8Array
	width: 360
	height: 181
}

/**
 * Build a 360×181 lat-lon grid for ocean current particle animation.
 *
 * Current direction is derived from Ekman transport: wind stress rotated 90°
 * in the direction of the Coriolis force (rightward in NH, leftward in SH).
 * When wind data is absent, direction vectors are zero and particles won't move.
 */
export function computeOceanCurrentGrid(
	mesh: SphereMesh,
	isLand: Uint8Array,
	oceanWarmth: Float32Array,
	windU?: Float32Array,
	windV?: Float32Array,
): OceanCurrentGrid {
	const W = 360
	const H = 181
	const warmthGrid = new Float32Array(W * H)
	const uGrid = new Float32Array(W * H)
	const vGrid = new Float32Array(W * H)
	const isOcean = new Uint8Array(W * H)
	const cnt = new Int32Array(W * H)
	const windUGrid = windU ? new Float32Array(W * H) : null
	const windVGrid = windV ? new Float32Array(W * H) : null
	const windCnt = windU ? new Int32Array(W * H) : null

	const { latDeg, lonDeg } = getClimateGeometry(mesh)
	const N = mesh.numRegions

	for (let r = 0; r < N; r++) {
		const li = Math.max(0, Math.min(H - 1, Math.round(latDeg[r] + 90)))
		const ci = Math.max(0, Math.min(W - 1, Math.round(lonDeg[r] + 180)))
		const idx = li * W + ci
		if (!isLand[r]) {
			warmthGrid[idx] += oceanWarmth[r]
			isOcean[idx] = 1
			cnt[idx]++
		}
		if (windU && windV && windUGrid && windVGrid && windCnt) {
			windUGrid[idx] += windU[r]
			windVGrid[idx] += windV[r]
			windCnt[idx]++
		}
	}

	for (let i = 0; i < W * H; i++) {
		if (cnt[i] > 1) warmthGrid[i] /= cnt[i]
		if (windCnt && windCnt[i] > 1) {
			windUGrid![i] /= windCnt[i]
			windVGrid![i] /= windCnt[i]
		}
	}

	// Fill sparse polar/edge gaps with neighbour diffusion (3 passes)
	const tmpW = warmthGrid.slice()
	const tmpWU = windUGrid ? windUGrid.slice() : null
	const tmpWV = windVGrid ? windVGrid.slice() : null
	for (let pass = 0; pass < 3; pass++) {
		for (let li = 0; li < H; li++) {
			for (let ci = 0; ci < W; ci++) {
				const idx = li * W + ci
				if (cnt[idx] > 0) continue
				let sw = 0,
					swu = 0,
					swv = 0,
					n = 0
				const neighbors = [
					[li - 1, ci],
					[li + 1, ci],
					[li, (ci - 1 + W) % W],
					[li, (ci + 1) % W],
				] as const
				for (const [nl, nc] of neighbors) {
					if (nl < 0 || nl >= H) continue
					const ni = nl * W + nc
					if (cnt[ni] > 0) {
						sw += tmpW[ni]
						if (tmpWU) swu += tmpWU[ni]
						if (tmpWV) swv += tmpWV[ni]
						n++
					}
				}
				if (n > 0) {
					warmthGrid[idx] = sw / n
					if (windUGrid) windUGrid[idx] = swu / n
					if (windVGrid) windVGrid[idx] = swv / n
					cnt[idx] = 1
				}
			}
		}
		tmpW.set(warmthGrid)
		if (tmpWU && tmpWV) {
			tmpWU.set(windUGrid!)
			tmpWV.set(windVGrid!)
		}
	}

	// Ekman transport direction: wind rotated 90° by Coriolis sign
	// In NH (lat > 0): rightward of wind. In SH (lat < 0): leftward.
	// tanh smooths across the equator to avoid a hard discontinuity.
	for (let li = 0; li < H; li++) {
		const lat = li - 90
		const hemi = Math.tanh(lat / 5)
		for (let ci = 0; ci < W; ci++) {
			const idx = li * W + ci
			if (!isOcean[idx] || !windUGrid || !windVGrid) continue
			const wu = windUGrid[idx]
			const wv = windVGrid[idx]
			const cu = hemi * wv
			const cv = hemi * -wu
			const mag = Math.hypot(cu, cv)
			if (mag > 1e-9) {
				uGrid[idx] = cu / mag
				vGrid[idx] = cv / mag
			}
		}
	}

	return {
		u: uGrid,
		v: vGrid,
		warmth: warmthGrid,
		isOcean,
		width: W as 360,
		height: H as 181,
	}
}

/**
 * Apply ocean current temperature effects to the climate in-place.
 *
 * Warm currents (Gulf Stream, Kuroshio) raise SST and coastal land temps;
 * cold currents (California, Benguela, Humboldt) lower them.
 *
 * Ocean:  up to ±5°C for strong currents
 * Land:   up to ±3°C at coast, fading inland (coastalWarmth already fades)
 */
export function applyCurrentTemperatureEffect(
	mesh: SphereMesh,
	climate: OrogenClimate,
	isLand: Uint8Array,
	currents: OceanCurrentResult,
	monthlyTEQ?: Float32Array[],
): void {
	const N = mesh.numRegions
	const { latDeg, regionBin } = getClimateGeometry(mesh)
	const teqByBin =
		monthlyTEQ && monthlyTEQ.length === CURRENT_EFFECT_MONTHS
			? undefined
			: computeThermalEquator(mesh, climate.temperature_avg, TEQ_BINS)
	const hasMonthlyCurrents =
		!!currents.oceanWarmthMonthly &&
		!!currents.coastalWarmthMonthly &&
		!!monthlyTEQ &&
		monthlyTEQ.length === CURRENT_EFFECT_MONTHS
	const temperatureDeltaMonthly =
		currents.temperatureDeltaMonthly ??
		(currents.temperatureDeltaMonthly = new Float32Array(
			N * CURRENT_EFFECT_MONTHS,
		))

	function teqAt(r: number): number {
		const bin = regionBin[r]
		return teqByBin ? teqByBin[bin] : 0
	}

	if (hasMonthlyCurrents) {
		const oceanWarmthMonthly = currents.oceanWarmthMonthly!
		const coastalWarmthMonthly = currents.coastalWarmthMonthly!
		for (let r = 0; r < N; r++) {
			let annualDelta = 0
			const bin = regionBin[r]
			for (let m = 0; m < CURRENT_EFFECT_MONTHS; m++) {
				const w = isLand[r]
					? coastalWarmthMonthly[m * N + r]
					: oceanWarmthMonthly[m * N + r]
				if (Math.abs(w) < 0.01) continue
				const teq = monthlyTEQ![m][bin]
				const distFromTEQ = Math.abs(latDeg[r] - teq)
				const warmMaxAtLat = piecewise(
					WARM_EFFECT_XS,
					WARM_EFFECT_YS,
					distFromTEQ,
				)
				const coldMaxAtLat = piecewise(
					WARM_EFFECT_XS,
					COLD_EFFECT_YS,
					distFromTEQ,
				)
				let maxEffect = w > 0 ? warmMaxAtLat : coldMaxAtLat
				if (isLand[r]) maxEffect *= 0.6
				const delta = w * maxEffect
				temperatureDeltaMonthly[m * N + r] = delta
				climate.temperature_monthly[m * N + r] += delta
				annualDelta += delta
			}
			annualDelta /= CURRENT_EFFECT_MONTHS
			currents.temperatureDelta[r] = annualDelta
			climate.temperature_avg[r] += annualDelta
			climate.temperature_min[r] += annualDelta
			climate.temperature_max[r] += annualDelta
		}
		return
	}

	for (let r = 0; r < N; r++) {
		const w = isLand[r] ? currents.coastalWarmth[r] : currents.oceanWarmth[r]
		if (Math.abs(w) < 0.01) continue

		const distFromTEQ = Math.abs(latDeg[r] - teqAt(r))
		const warmMaxAtLat = piecewise(WARM_EFFECT_XS, WARM_EFFECT_YS, distFromTEQ)
		const coldMaxAtLat = piecewise(WARM_EFFECT_XS, COLD_EFFECT_YS, distFromTEQ)
		let maxEffect = w > 0 ? warmMaxAtLat : coldMaxAtLat
		if (isLand[r]) maxEffect *= 0.6
		const delta = w * maxEffect

		currents.temperatureDelta[r] = delta
		climate.temperature_avg[r] += delta
		climate.temperature_min[r] += delta
		climate.temperature_max[r] += delta
		for (let m = 0; m < CURRENT_EFFECT_MONTHS; m++) {
			temperatureDeltaMonthly[m * N + r] = delta
			climate.temperature_monthly[m * N + r] += delta
		}
	}
}
