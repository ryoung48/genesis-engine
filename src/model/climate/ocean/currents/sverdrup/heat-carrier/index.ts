import type {
	SurfaceHeatTransport,
	TransportSurfaceHeatParams,
} from "@/model/climate/ocean/currents/sverdrup/heat-carrier/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import { SVERDRUP_SCALAR_SOLVE } from "@/model/climate/ocean/currents/sverdrup/scalar-solve"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const DEG2RAD = Math.PI / 180
const EDDY_DIFFUSIVITY_M2_S = 2000
const MAX_SWEEPS = 1000
const RESIDUAL_TOLERANCE = 1e-5
const RESIDUAL_CHECK_INTERVAL = 10

function transport({
	flow,
	ocean,
	insolationWm2,
	planet,
	releaseSeconds,
	albedo,
	heatCapacityJm2K,
	exportSpeedMps,
}: TransportSurfaceHeatParams): SurfaceHeatTransport {
	if (releaseSeconds <= 0)
		throw new Error("Heat-carrier release time must be positive")
	if (albedo < 0 || albedo > 1)
		throw new Error("Heat-carrier albedo must be between zero and one")
	if (heatCapacityJm2K <= 0)
		throw new Error("Heat-carrier heat capacity must be positive")
	if (exportSpeedMps <= 0)
		throw new Error("Heat-carrier export speed must be positive")
	const dy = planet.radiusM * DEG2RAD
	const cellAreaM2 = new Float64Array(CELLS)
	let oceanAreaM2 = 0
	let areaWeightedInsolationW = 0
	for (let j = 0; j < H; j++) {
		const dx = dy * SVERDRUP_RASTER.rowCos[j]
		for (let i = 0; i < W; i++) {
			const idx = j * W + i
			const areaM2 = dx * dy
			cellAreaM2[idx] = areaM2
			if (!ocean[idx] || !Number.isFinite(insolationWm2[idx])) continue
			oceanAreaM2 += areaM2
			areaWeightedInsolationW += insolationWm2[idx] * areaM2
		}
	}
	const meanOceanInsolationWm2 =
		oceanAreaM2 > 0 ? areaWeightedInsolationW / oceanAreaM2 : 0

	const west = new Float32Array(CELLS)
	const east = new Float32Array(CELLS)
	const south = new Float32Array(CELLS)
	const north = new Float32Array(CELLS)
	const diagonal = new Float32Array(CELLS)
	for (let idx = 0; idx < CELLS; idx++)
		if (ocean[idx]) diagonal[idx] = 1 / releaseSeconds

	for (let j = 1; j < H - 1; j++) {
		const base = j * W
		const dx = dy * SVERDRUP_RASTER.rowCos[j]
		for (let i = 0; i < W; i++) {
			const idx = base + i
			if (!ocean[idx]) continue
			const eastIdx = base + SVERDRUP_RASTER.wrapColumn(i + 1)
			if (ocean[eastIdx]) {
				const advectiveFluxM2S = ((flow.x[idx] + flow.x[eastIdx]) / 2) * dy
				const diffusiveFluxM2S = (EDDY_DIFFUSIVITY_M2_S * dy) / dx
				diagonal[idx] += diffusiveFluxM2S / cellAreaM2[idx]
				diagonal[eastIdx] += diffusiveFluxM2S / cellAreaM2[eastIdx]
				east[idx] += diffusiveFluxM2S / cellAreaM2[idx]
				west[eastIdx] += diffusiveFluxM2S / cellAreaM2[eastIdx]
				if (advectiveFluxM2S >= 0) {
					diagonal[idx] += advectiveFluxM2S / cellAreaM2[idx]
					west[eastIdx] += advectiveFluxM2S / cellAreaM2[eastIdx]
				} else {
					const westwardFluxM2S = -advectiveFluxM2S
					diagonal[eastIdx] += westwardFluxM2S / cellAreaM2[eastIdx]
					east[idx] += westwardFluxM2S / cellAreaM2[idx]
				}
			}

			if (j >= H - 2) continue
			const northIdx = idx + W
			if (!ocean[northIdx]) continue
			const northDx = dy * SVERDRUP_RASTER.rowCos[j + 1]
			const faceWidthM = (dx + northDx) / 2
			const advectiveFluxM2S =
				((flow.y[idx] + flow.y[northIdx]) / 2) * faceWidthM
			const diffusiveFluxM2S = (EDDY_DIFFUSIVITY_M2_S * faceWidthM) / dy
			diagonal[idx] += diffusiveFluxM2S / cellAreaM2[idx]
			diagonal[northIdx] += diffusiveFluxM2S / cellAreaM2[northIdx]
			north[idx] += diffusiveFluxM2S / cellAreaM2[idx]
			south[northIdx] += diffusiveFluxM2S / cellAreaM2[northIdx]
			if (advectiveFluxM2S >= 0) {
				diagonal[idx] += advectiveFluxM2S / cellAreaM2[idx]
				south[northIdx] += advectiveFluxM2S / cellAreaM2[northIdx]
			} else {
				const southwardFluxM2S = -advectiveFluxM2S
				diagonal[northIdx] += southwardFluxM2S / cellAreaM2[northIdx]
				north[idx] += southwardFluxM2S / cellAreaM2[idx]
			}
		}
	}

	const pickupCPerS = new Float32Array(CELLS)
	let pickupIntegralM2CPerS = 0
	let pickupPowerW = 0
	for (let j = 1; j < H - 1; j++) {
		for (let i = 0; i < W; i++) {
			const idx = j * W + i
			if (!ocean[idx]) continue
			const absorbedSurplusWm2 =
				Math.max(0, insolationWm2[idx] - meanOceanInsolationWm2) * (1 - albedo)
			const hemisphereSign = Math.sign(j - H / 2)
			const polewardSpeedMps = Math.max(0, flow.y[idx] * hemisphereSign)
			const exportFraction = Math.min(1, polewardSpeedMps / exportSpeedMps)
			const pickup = (absorbedSurplusWm2 * exportFraction) / heatCapacityJm2K
			pickupCPerS[idx] = pickup
			pickupIntegralM2CPerS += pickup * cellAreaM2[idx]
			pickupPowerW += pickup * heatCapacityJm2K * cellAreaM2[idx]
		}
	}

	const carrierC = SVERDRUP_SCALAR_SOLVE.solve({
		ocean,
		source: pickupCPerS,
		west,
		east,
		south,
		north,
		diagonal,
		maxSweeps: MAX_SWEEPS,
		residualTolerance: RESIDUAL_TOLERANCE,
		residualCheckInterval: RESIDUAL_CHECK_INTERVAL,
	})
	const releaseCPerS = new Float32Array(CELLS)
	let releaseIntegralM2CPerS = 0
	for (let idx = 0; idx < CELLS; idx++) {
		if (!ocean[idx]) continue
		const release = carrierC[idx] / releaseSeconds
		releaseCPerS[idx] = release
		releaseIntegralM2CPerS += release * cellAreaM2[idx]
	}
	const solverConservationError =
		pickupIntegralM2CPerS > 0
			? Math.abs(releaseIntegralM2CPerS - pickupIntegralM2CPerS) /
				pickupIntegralM2CPerS
			: 0
	const releaseScale =
		releaseIntegralM2CPerS > 0
			? pickupIntegralM2CPerS / releaseIntegralM2CPerS
			: 0
	for (let idx = 0; idx < CELLS; idx++) {
		carrierC[idx] *= releaseScale
		releaseCPerS[idx] *= releaseScale
	}

	return {
		carrierC,
		pickupCPerS,
		releaseCPerS,
		solverConservationError,
		pickupPowerW,
	}
}

export const SVERDRUP_HEAT_CARRIER = {
	transport,
}
