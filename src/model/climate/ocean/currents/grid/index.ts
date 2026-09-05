import type {
	OceanGrid,
	OceanGridInput,
	OceanPathInput,
} from "@/model/climate/ocean/currents/grid/types"
import { RAIN } from "@/model/climate/precipitation/rain"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

const OCEAN_GRID_CELLS = 8192

function build(input: OceanGridInput): OceanGrid {
	const mesh =
		input.mesh.numRegions <= OCEAN_GRID_CELLS
			? input.mesh
			: MESH.buildSphereMesh({
					n: OCEAN_GRID_CELLS,
					jitter: 0,
					rng: RNG.createRng({ seed: 1 }),
				})
	const count = mesh.numRegions
	const geometry = RAIN.getClimateGeometry(mesh)
	const originalIndex = MESH.buildRegionSpatialIndex(input.mesh)
	const source = Int32Array.from(Array(count).keys(), (r) =>
		mesh === input.mesh
			? r
			: originalIndex.nearest(geometry.lonDeg[r], geometry.latDeg[r]),
	)
	const ocean = Uint8Array.from(source, (r) => input.ocean[r])
	const elevation = Float32Array.from(source, (r) => input.elevation[r])
	const sample = (values: Float32Array) =>
		Float32Array.from(
			Array(count * (values.length / input.mesh.numRegions)).keys(),
			(i) =>
				values[
					Math.floor(i / count) * input.mesh.numRegions + source[i % count]
				],
		)
	const climate = {
		...input.climate,
		temperature_avg: sample(input.climate.temperature_avg),
		temperature_monthly: sample(input.climate.temperature_monthly),
		temperature_monthly_nolapse: sample(
			input.climate.temperature_monthly_nolapse,
		),
	}
	const targetIndex = MESH.buildRegionSpatialIndex(mesh)
	const originalGeometry = RAIN.getClimateGeometry(input.mesh)
	const region = Int32Array.from(Array(input.mesh.numRegions).keys(), (r) =>
		mesh === input.mesh
			? r
			: targetIndex.nearest(
					originalGeometry.lonDeg[r],
					originalGeometry.latDeg[r],
				),
	)
	const waterPath = ({ start, end }: OceanPathInput) => {
		const distance = Math.hypot(
			start[0] - end[0],
			start[1] - end[1],
			start[2] - end[2],
		)
		const samples = Math.max(
			2,
			Math.ceil(
				distance / (Math.sqrt((4 * Math.PI) / input.mesh.numRegions) * 0.4),
			),
		)
		for (let k = 1; k < samples; k++) {
			const t = k / samples
			const x = start[0] * (1 - t) + end[0] * t,
				y = start[1] * (1 - t) + end[1] * t,
				z = start[2] * (1 - t) + end[2] * t
			const r = originalIndex.nearest(
				(Math.atan2(y, x) * 180) / Math.PI,
				(Math.asin(z / Math.hypot(x, y, z)) * 180) / Math.PI,
			)
			if (!input.ocean[r]) return false
		}
		return true
	}
	// Resolve coastal samples to a wet neighbour in the same original water body.
	for (let r = 0; r < region.length; r++) {
		if (!input.ocean[r]) continue
		const center = region[r]
		const start = input.mesh.r_xyz.subarray(3 * r, 3 * r + 3)
		if (
			ocean[center] &&
			waterPath({ start, end: mesh.r_xyz.subarray(3 * center, 3 * center + 3) })
		)
			continue
		let best = -1
		let bestDot = -Infinity
		for (let j = mesh.adjOffset[center]; j < mesh.adjOffset[center + 1]; j++) {
			const nb = mesh.adjList[j]
			if (!ocean[nb]) continue
			if (!waterPath({ start, end: mesh.r_xyz.subarray(3 * nb, 3 * nb + 3) }))
				continue
			const dot =
				input.mesh.r_xyz[3 * r] * mesh.r_xyz[3 * nb] +
				input.mesh.r_xyz[3 * r + 1] * mesh.r_xyz[3 * nb + 1] +
				input.mesh.r_xyz[3 * r + 2] * mesh.r_xyz[3 * nb + 2]
			if (dot > bestDot) {
				best = nb
				bestDot = dot
			}
		}
		region[r] = best
	}
	const a: number[] = [],
		b: number[] = [],
		eastA: number[] = [],
		northA: number[] = [],
		eastB: number[] = [],
		northB: number[] = [],
		width: number[] = [],
		distance: number[] = []
	const area = new Float64Array(count)
	for (let s = 0; s < mesh.numSides; s++) {
		if (s > mesh.halfedges[s]) continue
		const ra = mesh.s_begin_r[s],
			rb = mesh.s_end_r[s]
		const inner = mesh.s_inner_t[s],
			outer = mesh.s_outer_t[s]
		const d =
			input.radius *
			Math.hypot(
				mesh.r_xyz[3 * ra] - mesh.r_xyz[3 * rb],
				mesh.r_xyz[3 * ra + 1] - mesh.r_xyz[3 * rb + 1],
				mesh.r_xyz[3 * ra + 2] - mesh.r_xyz[3 * rb + 2],
			)
		const w =
			input.radius *
			Math.hypot(
				mesh.t_xyz[3 * inner] - mesh.t_xyz[3 * outer],
				mesh.t_xyz[3 * inner + 1] - mesh.t_xyz[3 * outer + 1],
				mesh.t_xyz[3 * inner + 2] - mesh.t_xyz[3 * outer + 2],
			)
		area[ra] += (w * d) / 4
		area[rb] += (w * d) / 4
		if (!ocean[ra] || !ocean[rb] || w <= 0 || d <= 0) continue
		if (
			!waterPath({
				start: mesh.r_xyz.subarray(3 * ra, 3 * ra + 3),
				end: mesh.r_xyz.subarray(3 * rb, 3 * rb + 3),
			})
		)
			continue
		let ja = mesh.adjOffset[ra],
			jb = mesh.adjOffset[rb]
		while (mesh.adjList[ja] !== rb) ja++
		while (mesh.adjList[jb] !== ra) jb++
		a.push(ra)
		b.push(rb)
		eastA.push(geometry.edgeEastward[ja])
		northA.push(geometry.edgeNorthward[ja])
		eastB.push(-geometry.edgeEastward[jb])
		northB.push(-geometry.edgeNorthward[jb])
		width.push(w)
		distance.push(d)
	}
	const edgeCount = a.length
	const bodyOffset = new Int32Array(count + 1)
	for (let e = 0; e < edgeCount; e++) {
		bodyOffset[a[e] + 1]++
		bodyOffset[b[e] + 1]++
	}
	for (let r = 0; r < count; r++) bodyOffset[r + 1] += bodyOffset[r]
	const bodyEdges = new Int32Array(2 * edgeCount)
	const cursor = Int32Array.from(bodyOffset.subarray(0, count))
	for (let e = 0; e < edgeCount; e++) {
		bodyEdges[cursor[a[e]]++] = e
		bodyEdges[cursor[b[e]]++] = e
	}
	const body = new Int32Array(count).fill(-1)
	const bodyQueue = new Int32Array(count)
	for (let seed = 0; seed < count; seed++) {
		if (!ocean[seed] || body[seed] >= 0) continue
		let head = 0,
			tail = 1
		bodyQueue[0] = seed
		body[seed] = seed
		while (head < tail) {
			const r = bodyQueue[head++]
			for (let j = bodyOffset[r]; j < bodyOffset[r + 1]; j++) {
				const e = bodyEdges[j]
				const nb = a[e] === r ? b[e] : a[e]
				if (body[nb] < 0) {
					body[nb] = seed
					bodyQueue[tail++] = nb
				}
			}
		}
	}
	return {
		mesh,
		source,
		region,
		ocean,
		body,
		bodyOffset,
		bodyEdges,
		elevation,
		climate,
		area,
		a: Int32Array.from(a),
		b: Int32Array.from(b),
		eastA: Float64Array.from(eastA),
		northA: Float64Array.from(northA),
		eastB: Float64Array.from(eastB),
		northB: Float64Array.from(northB),
		width: Float64Array.from(width),
		distance: Float64Array.from(distance),
	}
}

export const OCEAN_GRID = { build }
