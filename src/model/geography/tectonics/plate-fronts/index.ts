import type {
	BuildPlateFrontsParams,
	ClassifiedEdge,
	ClassifyEdgesParams,
	Front,
	FrontEdges,
	PlateFronts,
	SmoothAlongParams,
	SubductionFront,
} from "@/model/geography/tectonics/plate-fronts/types"
import { PLATE_MOTION } from "@/model/geography/tectonics/plate-motion"
import { RNG } from "@/model/shared/random/rng"

const ANDEAN_MYR: [number, number] = [40, 140]
const MIN_RATE_CM_YR = 0.4
const TRANSFORM_RATIO = 0.45
const SMOOTH_KM = 450
const SUBDUCTION_KIND_SALT = 3
const FRONT_SEED_SALT = 0xbe17

function smoothAlong({
	edges,
	group,
	values,
	iterations,
}: SmoothAlongParams): void {
	const cellIndex = new Map<number, number>()
	for (const e of group) {
		for (const c of [edges.cellA[e], edges.cellB[e]]) {
			if (!cellIndex.has(c)) cellIndex.set(c, cellIndex.size)
		}
	}
	const cells = cellIndex.size
	const cellOf = group.map((e) => [
		cellIndex.get(edges.cellA[e])!,
		cellIndex.get(edges.cellB[e])!,
	])
	const sum = new Float64Array(cells)
	const count = new Float64Array(cells)
	for (let g = 0; g < group.length; g++) {
		count[cellOf[g][0]]++
		count[cellOf[g][1]]++
	}
	for (const field of values) {
		for (let it = 0; it < iterations; it++) {
			sum.fill(0)
			for (let g = 0; g < group.length; g++) {
				const v = field[group[g]]
				sum[cellOf[g][0]] += v
				sum[cellOf[g][1]] += v
			}
			for (let g = 0; g < group.length; g++) {
				const [a, b] = cellOf[g]
				field[group[g]] = 0.5 * (sum[a] / count[a] + sum[b] / count[b])
			}
		}
	}
}

function classifyEdges({
	mesh,
	motion,
}: ClassifyEdgesParams): ClassifiedEdge[] {
	const { numRegions, r_xyz, adjOffset, adjList } = mesh
	const cellPlate = motion.plates.cellPlate
	const found: ClassifiedEdge[] = []
	for (let a = 0; a < numRegions; a++) {
		const plateA = cellPlate[a]
		for (let k = adjOffset[a]; k < adjOffset[a + 1]; k++) {
			const b = adjList[k]
			if (b < a) continue
			const plateB = cellPlate[b]
			if (plateA === plateB) continue
			const ax = r_xyz[3 * a]
			const ay = r_xyz[3 * a + 1]
			const az = r_xyz[3 * a + 2]
			const bx = r_xyz[3 * b]
			const by = r_xyz[3 * b + 1]
			const bz = r_xyz[3 * b + 2]
			const mLen = Math.hypot(ax + bx, ay + by, az + bz) || 1
			const mx = (ax + bx) / mLen
			const my = (ay + by) / mLen
			const mz = (az + bz) / mLen
			const dx = bx - ax
			const dy = by - ay
			const dz = bz - az
			const dm = dx * mx + dy * my + dz * mz
			const tx = dx - dm * mx
			const ty = dy - dm * my
			const tz = dz - dm * mz
			const tLen = Math.hypot(tx, ty, tz) || 1
			const nx = tx / tLen
			const ny = ty / tLen
			const nz = tz / tLen
			const va = PLATE_MOTION.velocityCmYr({
				motion,
				plate: plateA,
				x: mx,
				y: my,
				z: mz,
			})
			const vb = PLATE_MOTION.velocityCmYr({
				motion,
				plate: plateB,
				x: mx,
				y: my,
				z: mz,
			})
			const rx = vb[0] - va[0]
			const ry = vb[1] - va[1]
			const rz = vb[2] - va[2]
			const opening = rx * nx + ry * ny + rz * nz
			const slip = Math.hypot(
				rx - opening * nx,
				ry - opening * ny,
				rz - opening * nz,
			)
			found.push({ cellA: a, cellB: b, plateA, plateB, opening, slip })
		}
	}
	return found
}

function build({
	mesh,
	motion,
	planetRadiusKm,
	seed,
}: BuildPlateFrontsParams): PlateFronts {
	const plates = motion.plates
	const found = classifyEdges({ mesh, motion })
	const count = found.length
	const edges: FrontEdges = {
		count,
		cellA: Int32Array.from(found, (e) => e.cellA),
		cellB: Int32Array.from(found, (e) => e.cellB),
		plateA: Int32Array.from(found, (e) => e.plateA),
		plateB: Int32Array.from(found, (e) => e.plateB),
		closingCmYr: new Float32Array(count),
		overA: new Uint8Array(count),
	}
	const opening = Float32Array.from(found, (e) => e.opening)
	const slip = Float32Array.from(found, (e) => e.slip)

	const byPair = new Map<number, number[]>()
	for (let i = 0; i < count; i++) {
		const key =
			Math.min(edges.plateA[i], edges.plateB[i]) * 100003 +
			Math.max(edges.plateA[i], edges.plateB[i])
		const list = byPair.get(key)
		if (list) list.push(i)
		else byPair.set(key, [i])
	}
	let edgeSum = 0
	for (let j = 0; j < mesh.neighborDist.length; j++)
		edgeSum += mesh.neighborDist[j]
	const edgeKm =
		(edgeSum / Math.max(1, mesh.neighborDist.length)) * planetRadiusKm
	const iterations = Math.max(1, Math.round(SMOOTH_KM / edgeKm))
	for (const group of byPair.values())
		smoothAlong({ edges, group, values: [opening, slip], iterations })

	const subduction = new Map<number, SubductionFront>()
	const ridge = new Map<number, Front>()
	for (let i = 0; i < count; i++) {
		const pa = edges.plateA[i]
		const pb = edges.plateB[i]
		const landA = !plates.isOcean.has(pa)
		const landB = !plates.isOcean.has(pb)
		const open = opening[i]
		edges.closingCmYr[i] = -open
		if (Math.hypot(open, slip[i]) < MIN_RATE_CM_YR) continue
		if (Math.abs(open) < TRANSFORM_RATIO * slip[i]) continue
		const lo = Math.min(pa, pb)
		const hi = Math.max(pa, pb)
		const id = lo * 131 + hi * 17
		const key = lo * 100003 + hi
		if (open > 0) {
			if (landA || landB) continue
			const front = ridge.get(key)
			if (front) front.edges.push(i)
			else ridge.set(key, { pa: lo, pb: hi, edges: [i], id })
			continue
		}
		if (landA && landB) continue
		const densityA = plates.density.get(pa) ?? 2.7
		const densityB = plates.density.get(pb) ?? 2.7
		edges.overA[i] =
			landA !== landB ? (landA ? 1 : 0) : densityA <= densityB ? 1 : 0
		const front = subduction.get(key)
		if (front) front.edges.push(i)
		else {
			const r = RNG.makeRng(
				(seed ^ FRONT_SEED_SALT) + SUBDUCTION_KIND_SALT * 7919 + id,
			)
			subduction.set(key, {
				pa: lo,
				pb: hi,
				edges: [i],
				id,
				activeMyr: ANDEAN_MYR[0] + (ANDEAN_MYR[1] - ANDEAN_MYR[0]) * r(),
			})
		}
	}
	const byId = <T extends Front>(list: Map<number, T>): T[] =>
		[...list.values()].sort((x, y) => x.id - y.id)
	return { edges, subduction: byId(subduction), ridge: byId(ridge) }
}

export const PLATE_FRONTS = { build }
