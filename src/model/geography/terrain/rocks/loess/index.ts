import { KOPPEN } from "@/model/climate/classification/koppen"
import type {
	DustCarryParams,
	DustSourceParams,
	LoessParams,
} from "@/model/geography/terrain/rocks/loess/types"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MATH } from "@/model/shared/math/core"

const C = SURFACE_CONFIG
const HOT_DESERT = KOPPEN.koppenLabels.indexOf("BWh")
const COLD_DESERT = KOPPEN.koppenLabels.indexOf("BWk")
const OUTWASH_TILL = 0.5

function dustSource({
	simMesh,
	sample,
	isLand,
	koppen,
	till,
}: DustSourceParams): Float32Array {
	const n = simMesh.mesh.numRegions
	const source = new Float32Array(n)
	for (let c = 0; c < n; c++) {
		const r = sample.regionOfCell[c]
		if (!isLand[r]) continue
		const climate = koppen[r]
		const desert =
			climate === COLD_DESERT ? 1 : climate === HOT_DESERT ? C.loessHotShare : 0
		source[c] = Math.max(desert, till[r] >= OUTWASH_TILL ? 1 : 0)
	}
	return source
}

function carryDust({
	simMesh,
	sample,
	planetRadiusKm,
	source,
	windU,
	windV,
}: DustCarryParams): Float32Array {
	const { r_xyz, adjOffset, adjList, numRegions: n } = simMesh.mesh
	const stepKm = C.loessReachKm / 6
	const carried = new Float32Array(n)
	for (let c = 0; c < n; c++) {
		const r = sample.regionOfCell[c]
		const u = windU[r]
		const v = windV[r]
		const speed = Math.hypot(u, v)
		if (!(speed > C.loessMinWind)) continue
		const x = r_xyz[3 * c]
		const y = r_xyz[3 * c + 1]
		const z = r_xyz[3 * c + 2]
		const flat = Math.hypot(x, y)
		const ex = flat > 1e-6 ? -y / flat : 1
		const ey = flat > 1e-6 ? x / flat : 0
		const nx = -x * z
		const ny = -y * z
		const nz = x * x + y * y
		const nl = Math.hypot(nx, ny, nz) || 1
		const tx = (-u * ex - (v * nx) / nl) / speed
		const ty = (-u * ey - (v * ny) / nl) / speed
		const tz = (-v * nz) / nl / speed
		let sum = 0
		for (let k = 1; k <= C.loessSteps; k++) {
			const d = k * stepKm
			const theta = d / planetRadiusKm
			const cos = Math.cos(theta)
			const sin = Math.sin(theta)
			const s =
				source[
					simMesh.nearest({
						x: x * cos + tx * sin,
						y: y * cos + ty * sin,
						z: z * cos + tz * sin,
					})
				]
			sum += (s * Math.exp(-d / C.loessReachKm) * stepKm) / C.loessReachKm
		}
		carried[c] = sum
	}
	const blurred = new Float32Array(n)
	for (let c = 0; c < n; c++) {
		let total = carried[c]
		let count = 1
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			total += carried[adjList[k]]
			count++
		}
		blurred[c] = total / count
	}
	return blurred
}

function thickness(params: LoessParams): Float32Array {
	const { simMesh, sample, mesh, planetRadiusKm, isLand, koppen } = params
	const { till, windU, windV, temperatureAvg, elevationKm } = params
	const carried = carryDust({
		simMesh,
		sample,
		planetRadiusKm,
		source: dustSource({ simMesh, sample, isLand, koppen, till }),
		windU,
		windV,
	})
	const { adjOffset, adjList, neighborDist, numRegions: n } = mesh
	const out = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!isLand[r] || koppen[r] === COLD_DESERT || koppen[r] === HOT_DESERT)
			continue
		const dust = carried[sample.cellOfRegion[r]]
		if (!(dust > 0.02)) continue
		let steepest = 0
		for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
			const km = neighborDist[k] * planetRadiusKm
			if (km > 0)
				steepest = Math.max(
					steepest,
					Math.abs(elevationKm[adjList[k]] - elevationKm[r]) / km,
				)
		}
		out[r] =
			C.loessKm *
			Math.min(1, dust / C.loessSaturate) *
			MATH.ramp({ range: C.loessLand, x: steepest }) *
			MATH.ramp({ range: C.loessWarmC, x: temperatureAvg[r] })
	}
	return out
}

export const LOESS = { thickness, dustSource, carryDust }
