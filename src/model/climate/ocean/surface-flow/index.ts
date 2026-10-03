import type {
	DisplayMonthFields,
	DisplayMonthParams,
	EdgeGeometry,
	SstFieldsFlowParams,
	SstFlowMonthsParams,
	SstGradientFlowParams,
	SurfaceFlowField,
	SurfaceFlowFields,
	SurfaceFlowGridParams,
} from "@/model/climate/ocean/surface-flow/types"
import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import type { FlowGrid } from "@/model/climate/weather/wind/types"
import type { SphereMesh } from "@/model/mesh/types"
import { PARALLEL } from "@/model/shared/parallel"

const SMOOTHING_PASSES = 2

const wrapLonDeltaDeg = (delta: number): number => {
	if (delta > 180) return delta - 360
	if (delta < -180) return delta + 360
	return delta
}

function edgeGeometry(mesh: SphereMesh): EdgeGeometry {
	const { adjOffset, adjList } = mesh
	const { latDeg, lonDeg } = RAIN.getClimateGeometry(mesh)
	const dx = PARALLEL.shared(new Float64Array(adjList.length))
	const dy = PARALLEL.shared(new Float64Array(adjList.length))
	const distSq = PARALLEL.shared(new Float64Array(adjList.length))
	for (let r = 0; r < mesh.numRegions; r++)
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			dx[j] =
				wrapLonDeltaDeg(lonDeg[nb] - lonDeg[r]) *
				Math.cos((((latDeg[r] + latDeg[nb]) * 0.5) / 180) * Math.PI)
			dy[j] = latDeg[nb] - latDeg[r]
			distSq[j] = dx[j] * dx[j] + dy[j] * dy[j]
		}
	return { dx, dy, distSq }
}

// Geostrophic flow along SST isotherms, treating warm water as high sea
// surface: (u, v) = fSign * k x grad(sst), which keeps warm water on the right
// of the flow where f > 0.
function fromSstGradient({
	adjOffset,
	adjList,
	isLand,
	sst,
	fSign,
	edges,
}: SstGradientFlowParams): SurfaceFlowField {
	const N = isLand.length
	let srcX = new Float32Array(N)
	let srcY = new Float32Array(N)
	let dstX = new Float32Array(N)
	let dstY = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		let gx = 0
		let gy = 0
		let weightSum = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			const dx = edges.dx[j]
			const dy = edges.dy[j]
			const distSq = edges.distSq[j]
			if (distSq <= 1e-6) continue
			const dw = (isLand[nb] ? 0 : sst[nb]) - sst[r]
			gx += (dw * dx) / distSq
			gy += (dw * dy) / distSq
			weightSum += 1
		}
		if (weightSum > 0) {
			srcX[r] = gx / weightSum
			srcY[r] = gy / weightSum
		}
	}

	for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
		for (let r = 0; r < N; r++) {
			if (isLand[r]) {
				dstX[r] = 0
				dstY[r] = 0
				continue
			}
			let sumX = srcX[r]
			let sumY = srcY[r]
			let count = 1
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (isLand[nb]) continue
				sumX += srcX[nb]
				sumY += srcY[nb]
				count++
			}
			dstX[r] = sumX / count
			dstY[r] = sumY / count
		}
		;[srcX, dstX] = [dstX, srcX]
		;[srcY, dstY] = [dstY, srcY]
	}

	const u = new Float32Array(N)
	const v = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		u[r] = -srcY[r] * fSign[r]
		v[r] = srcX[r] * fSign[r]
	}
	return { u, v }
}

function fromSstFields({
	mesh,
	isLand,
	fSign,
	sst,
	sstMonthly,
}: SstFieldsFlowParams): SurfaceFlowFields {
	const N = mesh.numRegions
	const edges = edgeGeometry(mesh)
	const { adjOffset, adjList } = mesh
	const annual = fromSstGradient({
		adjOffset,
		adjList,
		isLand,
		sst,
		fSign,
		edges,
	})
	const flowUMonthly = PARALLEL.shared(new Float32Array(sstMonthly.length))
	const flowVMonthly = PARALLEL.shared(new Float32Array(sstMonthly.length))
	PARALLEL.mapItems({
		task: "sstFlowMonths",
		kernel: sstFlowMonths,
		count: sstMonthly.length / N,
		payload: {
			adjOffset: PARALLEL.shared(adjOffset),
			adjList: PARALLEL.shared(adjList),
			isLand: PARALLEL.shared(isLand),
			sstMonthly: PARALLEL.shared(sstMonthly),
			fSign: PARALLEL.shared(fSign),
			edges,
			flowUMonthly,
			flowVMonthly,
		},
	})
	return {
		flowU: annual.u,
		flowV: annual.v,
		flowUMonthly: PARALLEL.local(flowUMonthly),
		flowVMonthly: PARALLEL.local(flowVMonthly),
	}
}

function sstFlowMonths({
	start,
	end,
	adjOffset,
	adjList,
	isLand,
	sstMonthly,
	fSign,
	edges,
	flowUMonthly,
	flowVMonthly,
}: SstFlowMonthsParams): void {
	const N = isLand.length
	for (let month = start; month < end; month++) {
		const flow = fromSstGradient({
			adjOffset,
			adjList,
			isLand,
			sst: sstMonthly.subarray(month * N, (month + 1) * N),
			fSign,
			edges,
		})
		flowUMonthly.set(flow.u, month * N)
		flowVMonthly.set(flow.v, month * N)
	}
}

// month 0 is the annual mean, 1..12 are calendar months.
function forDisplayMonth({
	oceanCurrents,
	numRegions,
	month,
}: DisplayMonthParams): DisplayMonthFields {
	if (month <= 0)
		return {
			sst: oceanCurrents.sst,
			u: oceanCurrents.flowU,
			v: oceanCurrents.flowV,
		}
	const start = (month - 1) * numRegions
	const end = month * numRegions
	return {
		sst: oceanCurrents.sstMonthly.subarray(start, end),
		u: oceanCurrents.flowUMonthly.subarray(start, end),
		v: oceanCurrents.flowVMonthly.subarray(start, end),
	}
}

function toGrid({
	mesh,
	isLand,
	fields,
	allowCell,
}: SurfaceFlowGridParams): FlowGrid {
	const N = mesh.numRegions
	const speed = new Float32Array(N)
	for (let r = 0; r < N; r++) speed[r] = Math.hypot(fields.u[r], fields.v[r])
	return WIND.rasterizeVectorGrid({
		mesh,
		vectorU: fields.u,
		vectorV: fields.v,
		vectorSpeed: speed,
		options: {
			scalar: fields.sst,
			allowCell,
			isBlockedRegion: (region) => !!isLand[region],
		},
	})
}

export const SURFACE_FLOW = {
	fromSstFields,
	sstFlowMonths,
	forDisplayMonth,
	toGrid,
}
