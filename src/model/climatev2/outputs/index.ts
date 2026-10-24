import type {
	AnnualMeanParams,
	BilinearWeights,
	BilinearWeightsParams,
	CurrentFlows,
	CurrentFlowsParams,
	MonthlyCellsParams,
	SampleCellsParams,
	SeaSurface,
	SeaSurfaceParams,
	WindFields,
	WindFieldsParams,
} from "@/model/climatev2/outputs/types"

// v2's warm/cold sea anomaly (°C vs the latitude's mean sea) that fills the ±1 display scale
const SST_ANOMALY_SATURATION_C = 9

const MONTHS = 12
const DEG = 180 / Math.PI

function bilinearWeights({
	mesh,
	grid,
}: BilinearWeightsParams): BilinearWeights {
	const N = mesh.numRegions
	const { w, h, step } = grid
	const xyz = mesh.r_xyz
	const index = new Int32Array(4 * N)
	const weight = new Float32Array(4 * N)
	for (let r = 0; r < N; r++) {
		const latDeg = Math.asin(Math.max(-1, Math.min(1, xyz[3 * r + 2]))) * DEG
		const lonDeg = Math.atan2(xyz[3 * r + 1], xyz[3 * r]) * DEG
		const x = (lonDeg + 180) / step - 0.5
		const y = Math.max(0, Math.min(h - 1, (90 - latDeg) / step - 0.5))
		const x0 = Math.floor(x)
		const y0 = Math.floor(y)
		const fx = x - x0
		const fy = y - y0
		const i0 = ((x0 % w) + w) % w
		const i1 = i0 + 1 === w ? 0 : i0 + 1
		const j1 = y0 + 1 < h ? y0 + 1 : y0
		const k = 4 * r
		index[k] = y0 * w + i0
		index[k + 1] = y0 * w + i1
		index[k + 2] = j1 * w + i0
		index[k + 3] = j1 * w + i1
		weight[k] = (1 - fx) * (1 - fy)
		weight[k + 1] = fx * (1 - fy)
		weight[k + 2] = (1 - fx) * fy
		weight[k + 3] = fx * fy
	}
	return { index, weight }
}

function sampleCells({
	weights,
	field,
	fieldSize,
	months,
	out,
	cells,
}: SampleCellsParams): void {
	const { index, weight } = weights
	const N = index.length / 4
	for (let m = 0; m < months; m++) {
		const off = m * fieldSize
		const outOff = m * N
		for (let r = 0; r < N; r++) {
			if (cells && !cells[r]) continue
			const k = 4 * r
			out[outOff + r] =
				weight[k] * field[off + index[k]] +
				weight[k + 1] * field[off + index[k + 1]] +
				weight[k + 2] * field[off + index[k + 2]] +
				weight[k + 3] * field[off + index[k + 3]]
		}
	}
}

function monthlyCells({
	weights,
	field,
	fieldSize,
}: MonthlyCellsParams): Float32Array {
	const out = new Float32Array((MONTHS * weights.index.length) / 4)
	sampleCells({ weights, field, fieldSize, months: MONTHS, out, cells: null })
	return out
}

function annualMean({ monthly, N }: AnnualMeanParams): Float32Array {
	const out = new Float32Array(N)
	for (let m = 0; m < MONTHS; m++)
		for (let r = 0; r < N; r++) out[r] += monthly[m * N + r] / MONTHS
	return out
}

function repeatMonthly(annual: Float32Array): Float32Array {
	const out = new Float32Array(MONTHS * annual.length)
	for (let m = 0; m < MONTHS; m++) out.set(annual, m * annual.length)
	return out
}

function windFields({
	weights,
	circulation,
	fieldSize,
}: WindFieldsParams): WindFields {
	const N = weights.index.length / 4
	const at = { weights, fieldSize }
	const windUMonthly = monthlyCells({ ...at, field: circulation.u })
	const windVMonthly = monthlyCells({ ...at, field: circulation.v })
	const u = annualMean({ monthly: windUMonthly, N })
	const v = annualMean({ monthly: windVMonthly, N })
	const pressure = annualMean({
		monthly: monthlyCells({ ...at, field: circulation.slp }),
		N,
	})
	const windSpeed = new Float32Array(N)
	const windU = new Float32Array(N)
	const windV = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const speed = Math.hypot(u[r], v[r])
		windSpeed[r] = speed
		windU[r] = speed > 0 ? u[r] / speed : 0
		windV[r] = speed > 0 ? v[r] / speed : 0
	}
	return {
		wind: { windU, windV, pressure, windSpeed },
		windUMonthly,
		windVMonthly,
	}
}

function currentFlows({
	weights,
	ocean,
	fieldSize,
}: CurrentFlowsParams): CurrentFlows {
	const N = weights.index.length / 4
	const at = { weights, fieldSize }
	const flowUMonthly = monthlyCells({
		...at,
		field: ocean.monthly ? ocean.monthly.u : repeatMonthly(ocean.u),
	})
	const flowVMonthly = monthlyCells({
		...at,
		field: ocean.monthly ? ocean.monthly.v : repeatMonthly(ocean.v),
	})
	return {
		flowU: annualMean({ monthly: flowUMonthly, N }),
		flowV: annualMean({ monthly: flowVMonthly, N }),
		flowUMonthly,
		flowVMonthly,
	}
}

function seaSurface({ anomalyMonthly, isLand }: SeaSurfaceParams): SeaSurface {
	const N = isLand.length
	const saturation = SST_ANOMALY_SATURATION_C
	const sstMonthly = new Float32Array(MONTHS * N)
	for (let i = 0; i < sstMonthly.length; i++) {
		if (isLand[i % N]) continue
		sstMonthly[i] = Math.max(-1, Math.min(1, anomalyMonthly[i] / saturation))
	}
	return { sst: annualMean({ monthly: sstMonthly, N }), sstMonthly }
}

export const CLIMATEV2_OUTPUTS = {
	sstAnomalySaturationC: SST_ANOMALY_SATURATION_C,
	bilinearWeights,
	sampleCells,
	annualMean,
	monthlyCells,
	windFields,
	currentFlows,
	seaSurface,
}
