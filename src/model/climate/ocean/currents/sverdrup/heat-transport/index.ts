import type {
	BuildTransportStencilParams,
	SolveHeatTransportParams,
	TransportStencil,
} from "@/model/climate/ocean/currents/sverdrup/heat-transport/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import { SVERDRUP_SCALAR_SOLVE } from "@/model/climate/ocean/currents/sverdrup/scalar-solve"
import { SVERDRUP_SST_ANOMALY } from "@/model/climate/ocean/currents/sverdrup/sst-anomaly"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const ROW_COS = SVERDRUP_RASTER.rowCos
const DEG2RAD = Math.PI / 180
const EDDY_DIFFUSIVITY_M2_S = 2000
const MAX_SWEEPS = 200
const RESIDUAL_TOLERANCE = 2e-2
const RESIDUAL_CHECK_INTERVAL = 10

function buildStencil({
	index,
	psi,
	additionalTransport,
	temperature,
	isOcean,
	planet,
	layerDepthM,
}: BuildTransportStencilParams): TransportStencil {
	const { ocean } = index
	const metersPerDeg = planet.radiusM * DEG2RAD
	const background = SVERDRUP_SST_ANOMALY.zonalMeanTemperature({
		index,
		temperature,
		isOcean,
	})
	const transportX = new Float32Array(CELLS)
	const transportY = new Float32Array(CELLS)
	const at = (idx: number) => (ocean[idx] ? psi[idx] : 0)
	for (let j = 1; j < H - 1; j++) {
		const base = j * W
		for (let i = 0; i < W; i++) {
			const idx = base + i
			if (!ocean[idx]) continue
			transportX[idx] = -(at(idx + W) - at(idx - W)) / (2 * metersPerDeg)
			transportY[idx] =
				(at(base + SVERDRUP_RASTER.wrapColumn(i + 1)) -
					at(base + SVERDRUP_RASTER.wrapColumn(i - 1))) /
				(2 * metersPerDeg * ROW_COS[j])
			transportX[idx] += additionalTransport.x[idx]
			transportY[idx] += additionalTransport.y[idx]
		}
	}

	const west = new Float32Array(CELLS)
	const east = new Float32Array(CELLS)
	const south = new Float32Array(CELLS)
	const north = new Float32Array(CELLS)
	const diagonal = new Float32Array(CELLS)
	const backgroundSource = new Float32Array(CELLS)
	for (let j = 1; j < H - 1; j++) {
		const base = j * W
		const dx = metersPerDeg * ROW_COS[j]
		for (let i = 0; i < W; i++) {
			const idx = base + i
			if (!ocean[idx]) continue
			const westIdx = base + SVERDRUP_RASTER.wrapColumn(i - 1)
			const eastIdx = base + SVERDRUP_RASTER.wrapColumn(i + 1)
			const southIdx = idx - W
			const northIdx = idx + W
			const depth = layerDepthM[idx]
			const transportWest = ocean[westIdx]
				? (transportX[westIdx] + transportX[idx]) / 2
				: 0
			const transportEast = ocean[eastIdx]
				? (transportX[idx] + transportX[eastIdx]) / 2
				: 0
			const transportSouth = ocean[southIdx]
				? (transportY[southIdx] + transportY[idx]) / 2
				: 0
			const transportNorth = ocean[northIdx]
				? (transportY[idx] + transportY[northIdx]) / 2
				: 0
			const diffusionX = EDDY_DIFFUSIVITY_M2_S / (dx * dx)
			const diffusionY = EDDY_DIFFUSIVITY_M2_S / (metersPerDeg * metersPerDeg)
			const advWest = Math.max(0, transportWest) / (depth * dx)
			const advEast = Math.max(0, -transportEast) / (depth * dx)
			const advSouth = Math.max(0, transportSouth) / (depth * metersPerDeg)
			const advNorth = Math.max(0, -transportNorth) / (depth * metersPerDeg)
			west[idx] = advWest + diffusionX
			east[idx] = advEast + diffusionX
			south[idx] = advSouth + diffusionY
			north[idx] = advNorth + diffusionY
			const transportOut =
				Math.max(0, transportEast) / (depth * dx) +
				Math.max(0, -transportWest) / (depth * dx) +
				Math.max(0, transportNorth) / (depth * metersPerDeg) +
				Math.max(0, -transportSouth) / (depth * metersPerDeg)
			const relaxationSeconds =
				(MIXED_LAYER.relaxationSeconds * depth) / MIXED_LAYER.depthM
			diagonal[idx] =
				1 / relaxationSeconds + transportOut + 2 * diffusionX + 2 * diffusionY
			backgroundSource[idx] =
				advWest * background[j] +
				advEast * background[j] +
				advSouth * background[j - 1] +
				advNorth * background[j + 1] -
				transportOut * background[j]
		}
	}
	return { west, east, south, north, diagonal, backgroundSource }
}

function solve(params: SolveHeatTransportParams): Float32Array {
	const { index, circulation, temperature, isOcean, planet, layerDepthM } =
		params
	const stencil = buildStencil(params)
	const temperatureGradient = SVERDRUP_SST_ANOMALY.zonalGradient({
		index,
		temperature,
		isOcean,
		planet,
	})
	const { vertical } = SVERDRUP_SST_ANOMALY.heatSource({
		circulation,
		ocean: index.ocean,
		temperatureGradient,
		upwelledDeficitC: params.upwelledDeficitC,
	})
	const source = stencil.backgroundSource
	for (let idx = 0; idx < CELLS; idx++)
		source[idx] += (vertical[idx] * MIXED_LAYER.depthM) / layerDepthM[idx]

	const anomaly = SVERDRUP_SCALAR_SOLVE.solve({
		ocean: index.ocean,
		source,
		west: stencil.west,
		east: stencil.east,
		south: stencil.south,
		north: stencil.north,
		diagonal: stencil.diagonal,
		maxSweeps: MAX_SWEEPS,
		residualTolerance: RESIDUAL_TOLERANCE,
		residualCheckInterval: RESIDUAL_CHECK_INTERVAL,
	})
	SVERDRUP_SST_ANOMALY.removeZonalMean({
		field: anomaly,
		ocean: index.ocean,
	})
	return anomaly
}

export const SVERDRUP_HEAT_TRANSPORT = {
	solve,
}
