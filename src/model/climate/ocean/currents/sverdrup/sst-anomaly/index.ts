import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import type {
	AnomalySolveParams,
	HeatSourceParams,
	SolveSstAnomalyParams,
	ZonalGradientParams,
	ZonalMeanParams,
} from "@/model/climate/ocean/currents/sverdrup/sst-anomaly/types"
import { THERMOCLINE } from "@/model/climate/ocean/currents/sverdrup/thermocline"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"
import { MATH } from "@/model/shared/math/core"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const ROW_COS = SVERDRUP_RASTER.rowCos
const DEG2RAD = Math.PI / 180
const wrapColumn = SVERDRUP_RASTER.wrapColumn

const ZONAL_SMOOTHING_PASSES = 3

const EDDY_DIFFUSIVITY_M2_S = 2000

// Upwelling at speed w cools the mixed layer at w * deficit / h, where the
// deficit is how much colder the upwelled water is. Downwelling warms more
// weakly: it only thickens an already-warm layer.
const UPWELLED_DEFICIT_C = 6
const DOWNWELLING_WARMING_FRACTION = 0.3
const MAX_VERTICAL_VELOCITY_M_S = 1e-4

// The upwelled deficit decays as the thermocline deepens: upwelling only
// reaches cold water where the layer is thin.
const THERMOCLINE_SCALE_M = 150

const MAX_SWEEPS = 200

// Stop on the residual, not on how far the last sweep moved. Gauss-Seidel
// crawls here -- the error only halves every ~40 sweeps -- so a small
// per-sweep change does not mean a small distance from the solution, and the
// old 0.005 C change criterion exited anywhere between 2e-3 and 1.8e-2 of
// relative residual depending on the month. Over-relaxation is not an option:
// upwind advection makes this operator non-symmetric, and measured omega >= 1.2
// diverges outright.
const RESIDUAL_TOLERANCE = 2e-2
const RESIDUAL_CHECK_INTERVAL = 10

// Meridional gradient of the zonal-mean ocean temperature, °C per metre.
function zonalGradient({
	index,
	temperature,
	isOcean,
	planet,
}: ZonalGradientParams): Float64Array {
	const metersPerDeg = planet.radiusM * DEG2RAD
	const sum = new Float64Array(H)
	const count = new Float64Array(H)
	for (let r = 0; r < temperature.length; r++) {
		if (!isOcean[r]) continue
		const row = Math.floor(index.regionCell[r] / W)
		sum[row] += temperature[r]
		count[row]++
	}
	const filledRows: number[] = []
	for (let j = 0; j < H; j++) if (count[j] > 0) filledRows.push(j)
	let mean = new Float64Array(H)
	for (let j = 0; j < H; j++) {
		let nearest = filledRows[0] ?? j
		for (const row of filledRows)
			if (Math.abs(row - j) < Math.abs(nearest - j)) nearest = row
		mean[j] = count[nearest] > 0 ? sum[nearest] / count[nearest] : 0
	}
	for (let pass = 0; pass < ZONAL_SMOOTHING_PASSES; pass++) {
		const next = new Float64Array(H)
		for (let j = 0; j < H; j++)
			next[j] =
				(mean[Math.max(0, j - 1)] +
					2 * mean[j] +
					mean[Math.min(H - 1, j + 1)]) /
				4
		mean = next
	}
	const gradient = new Float64Array(H)
	for (let j = 0; j < H; j++) {
		const south = Math.max(0, j - 1)
		const north = Math.min(H - 1, j + 1)
		gradient[j] = (mean[north] - mean[south]) / ((north - south) * metersPerDeg)
	}
	return gradient
}

// Heating (°C/s) from carrying water across the background meridional
// temperature gradient, plus Ekman upwelling cooling that only bites where
// the thermocline is shallow enough for upwelling to reach cold water.
function heatSource({
	circulation,
	ocean,
	temperatureGradient,
}: HeatSourceParams): Float32Array {
	const { flow, divergence, thermoclineDepth } = circulation
	const source = new Float32Array(CELLS)
	for (let j = 0; j < H; j++) {
		for (let i = 0; i < W; i++) {
			const idx = j * W + i
			if (!ocean[idx]) continue
			const deficit =
				UPWELLED_DEFICIT_C *
				Math.exp(
					-(thermoclineDepth[idx] - THERMOCLINE.easternDepthM) /
						THERMOCLINE_SCALE_M,
				)
			const w = MATH.clamp({
				value: divergence[idx],
				lo: -MAX_VERTICAL_VELOCITY_M_S,
				hi: MAX_VERTICAL_VELOCITY_M_S,
			})
			const vertical =
				w > 0
					? (-w * deficit) / MIXED_LAYER.depthM
					: (-w * UPWELLED_DEFICIT_C * DOWNWELLING_WARMING_FRACTION) /
						MIXED_LAYER.depthM
			source[idx] = -flow.y[idx] * temperatureGradient[j] + vertical
		}
	}
	return source
}

// Steady SST anomaly T' from u.grad(T') + T'/tau = source - kappa lap(T'),
// upwind in the advection term, solved by Gauss-Seidel sweeps alternating
// direction so information crosses a basin in a few passes.
function solveAnomaly({
	flow,
	ocean,
	source,
	planet,
}: AnomalySolveParams): Float32Array {
	const dy = planet.radiusM * DEG2RAD
	// The anomaly relaxes toward zero on the mixed layer's thermal timescale.
	const relaxation = 1 / MIXED_LAYER.relaxationSeconds
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
				relaxation +
				coefWest[idx] +
				coefEast[idx] +
				coefSouth[idx] +
				coefNorth[idx]
		}
	}

	let sourceNorm = 0
	for (let i = 0; i < CELLS; i++)
		if (ocean[i]) sourceNorm += source[i] * source[i]
	sourceNorm = Math.sqrt(sourceNorm)
	const target = RESIDUAL_TOLERANCE * Math.max(sourceNorm, 1e-300)

	const anomaly = new Float32Array(CELLS)
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
				const value =
					(source[idx] +
						coefWest[idx] * anomaly[base + wrapColumn(i - 1)] +
						coefEast[idx] * anomaly[base + wrapColumn(i + 1)] +
						coefSouth[idx] * anomaly[idx - W] +
						coefNorth[idx] * anomaly[idx + W]) /
					diagonal[idx]
				anomaly[idx] = value
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
					diagonal[idx] * anomaly[idx] -
					coefWest[idx] * anomaly[base + wrapColumn(i - 1)] -
					coefEast[idx] * anomaly[base + wrapColumn(i + 1)] -
					coefSouth[idx] * anomaly[idx - W] -
					coefNorth[idx] * anomaly[idx + W]
				residualSq += (source[idx] - applied) ** 2
			}
		}
		if (Math.sqrt(residualSq) < target) break
	}
	return anomaly
}

function removeZonalMean({ field, ocean }: ZonalMeanParams): void {
	for (let j = 0; j < H; j++) {
		const base = j * W
		let sum = 0
		let count = 0
		for (let i = 0; i < W; i++) {
			if (!ocean[base + i]) continue
			sum += field[base + i]
			count++
		}
		if (count === 0) continue
		const mean = sum / count
		for (let i = 0; i < W; i++) if (ocean[base + i]) field[base + i] -= mean
	}
}

// SST anomaly vs the zonal mean, °C, on the raster.
function solve({
	index,
	circulation,
	temperature,
	isOcean,
	planet,
}: SolveSstAnomalyParams): Float32Array {
	const { ocean } = index
	const source = heatSource({
		circulation,
		ocean,
		temperatureGradient: zonalGradient({
			index,
			temperature,
			isOcean,
			planet,
		}),
	})
	const anomaly = solveAnomaly({
		flow: circulation.flow,
		ocean,
		source,
		planet,
	})
	removeZonalMean({ field: anomaly, ocean })
	return anomaly
}

export const SVERDRUP_SST_ANOMALY = {
	solve,
}
