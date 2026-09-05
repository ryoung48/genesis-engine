import type {
	OceanGrid,
	OceanGridInput,
} from "@/model/climate/ocean/currents/grid/types"
import { RAIN } from "@/model/climate/precipitation/rain"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

function build(input: OceanGridInput): OceanGrid {
	const mesh =
		input.mesh.numRegions <= 8192
			? input.mesh
			: MESH.buildSphereMesh({
					n: 8192,
					jitter: 0,
					rng: RNG.createRng({ seed: 1 }),
				})
	const count = mesh.numRegions
	const geometry = RAIN.getClimateGeometry(mesh)
	const originalIndex = MESH.buildRegionSpatialIndex(input.mesh)
	const source = Int32Array.from({ length: count }, (_, r) =>
		mesh === input.mesh
			? r
			: originalIndex.nearest(geometry.lonDeg[r], geometry.latDeg[r]),
	)
	const ocean = Uint8Array.from(source, (r) => input.ocean[r])
	const elevation = Float32Array.from(source, (r) => input.elevation[r])
	const sample = (values: Float32Array) =>
		Float32Array.from(
			{ length: count * (values.length / input.mesh.numRegions) },
			(_, i) =>
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
	const region = Int32Array.from({ length: input.mesh.numRegions }, (_, r) =>
		mesh === input.mesh
			? r
			: targetIndex.nearest(
					originalGeometry.lonDeg[r],
					originalGeometry.latDeg[r],
				),
	)
	// Resolve coastal samples to a wet neighbour in the same original water body.
	for (let r = 0; r < region.length; r++) {
		if (!input.ocean[r] || ocean[region[r]]) continue
		const center = region[r]
		let best = -1
		let bestDot = -Infinity
		for (let j = mesh.adjOffset[center]; j < mesh.adjOffset[center + 1]; j++) {
			const nb = mesh.adjList[j]
			if (!ocean[nb]) continue
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
	let minimumLength = Infinity
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
		let blocked = false
		// Sample the complete coarse edge to retain narrow continental barriers.
		const samples = Math.max(
			2,
			Math.ceil(
				d /
					(input.radius *
						Math.sqrt((4 * Math.PI) / input.mesh.numRegions) *
						0.4),
			),
		)
		for (let k = 1; k < samples; k++) {
			const t = k / samples
			const x = mesh.r_xyz[3 * ra] * (1 - t) + mesh.r_xyz[3 * rb] * t
			const y = mesh.r_xyz[3 * ra + 1] * (1 - t) + mesh.r_xyz[3 * rb + 1] * t
			const z = mesh.r_xyz[3 * ra + 2] * (1 - t) + mesh.r_xyz[3 * rb + 2] * t
			const r = originalIndex.nearest(
				(Math.atan2(y, x) * 180) / Math.PI,
				(Math.asin(z / Math.hypot(x, y, z)) * 180) / Math.PI,
			)
			if (!input.ocean[r]) {
				blocked = true
				break
			}
		}
		if (blocked) continue
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
		minimumLength = Math.min(minimumLength, d)
	}
	return {
		mesh,
		source,
		region,
		ocean,
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
		minimumLength,
	}
}

export const OCEAN_GRID = { build }
