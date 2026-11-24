import type {
	BentPieces,
	BuildBentPiecesParams,
	DragParams,
	DragResult,
	PieceTerranesParams,
	Push,
} from "@/model/geography/tectonics/bent-pieces/types"
import { CRUST } from "@/model/geography/tectonics/crust"
import { PLATE_MOTION } from "@/model/geography/tectonics/plate-motion"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import { SIM_MESH } from "@/model/geography/tectonics/sim-mesh"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { VEC3 } from "@/model/shared/math/vec3"
import type { Vec3 } from "@/model/shared/math/vec3/types"
import { PriorityHeap } from "@/model/shared/min-heap"
import { RNG } from "@/model/shared/random/rng"

const P = PRESENT_CONFIG

function tang({ p, w }: { p: Vec3; w: Vec3 }): Vec3 {
	const r = VEC3.dot({ a: w, b: p })
	return [w[0] - r * p[0], w[1] - r * p[1], w[2] - r * p[2]]
}

function norm(v: Vec3): Vec3 {
	return VEC3.unit(v)
}

function landPieces({ params, isLand }: DragParams): Int32Array {
	const { space, crust, motion } = params
	const n = crust.numCells
	const { adjOffset, adjList } = space.mesh
	const tp = new Int32Array(n).fill(-1)
	const q: number[] = []
	for (let c = 0; c < n; c++)
		if (isLand[c] && !motion.plates.isOcean.has(crust.plate[c])) {
			tp[c] = crust.plate[c]
			q.push(c)
		}
	for (let h = 0; h < q.length; h++) {
		const c = q[h]
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (isLand[nb] && tp[nb] < 0) {
				tp[nb] = tp[c]
				q.push(nb)
			}
		}
	}
	return tp
}

function drag({ params, isLand }: DragParams): DragResult {
	const { space, crust, motion, simFronts } = params
	const n = crust.numCells
	const { adjOffset, adjList, r_xyz } = space.mesh
	const dist = new Float64Array(n).fill(Infinity)
	const src = new Int32Array(n).fill(-1)
	const push: Push[] = []
	const heap = new PriorityHeap<number>()
	const pushFrom = (c: number, other: number) => {
		if (!isLand[c]) return
		const x = r_xyz[3 * c]
		const y = r_xyz[3 * c + 1]
		const z = r_xyz[3 * c + 2]
		const va = PLATE_MOTION.velocityCmYr({
			motion,
			plate: crust.plate[c],
			x,
			y,
			z,
		})
		const vb = PLATE_MOTION.velocityCmYr({ motion, plate: other, x, y, z })
		const rel: Vec3 = [
			(vb[0] - va[0]) * 10,
			(vb[1] - va[1]) * 10,
			(vb[2] - va[2]) * 10,
		]
		const speed = Math.hypot(rel[0], rel[1], rel[2])
		const km = Math.min(P.dragMaxKm, speed * P.dragMyr)
		const l = speed || 1
		if (dist[c] === 0 && push[src[c]].km >= km) return
		if (dist[c] > 0) {
			dist[c] = 0
			heap.push(0, c)
		}
		src[c] = push.length
		push.push({ v: [rel[0] / l, rel[1] / l, rel[2] / l], km })
	}
	for (const front of simFronts) {
		front.cells.forEach((c, i) => {
			const own = crust.plate[c]
			const other = own === front.plateA ? front.plateB : front.plateA
			if (front.kind === "collision") pushFrom(c, other)
			else if (front.kind === "transform" && front.cellClosingCmYr[i] > 0)
				pushFrom(c, other)
			else if (front.kind === "subduction" && own === front.overPlate)
				pushFrom(c, other)
		})
	}
	const reach = 3 * P.dragKm
	for (let top = heap.pop(); top; top = heap.pop()) {
		const c = top.value
		if (top.key > dist[c]) continue
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (!isLand[nb] || crust.plate[nb] !== crust.plate[c]) continue
			const nd = top.key + SIM_MESH.distanceKm({ space, a: c, b: nb })
			if (nd < dist[nb] && nd <= reach) {
				dist[nb] = nd
				src[nb] = src[c]
				heap.push(nd, nb)
			}
		}
	}
	let D = new Float32Array(3 * n)
	for (let c = 0; c < n; c++) {
		if (src[c] < 0) continue
		const { v, km } = push[src[c]]
		const s = km * Math.exp(-dist[c] / P.dragKm)
		const r =
			v[0] * r_xyz[3 * c] + v[1] * r_xyz[3 * c + 1] + v[2] * r_xyz[3 * c + 2]
		for (let j = 0; j < 3; j++) D[3 * c + j] = s * (v[j] - r * r_xyz[3 * c + j])
	}
	const passes = Math.max(
		1,
		Math.round((P.dragSmoothKm / space.edgeKm) ** 2 / 0.43),
	)
	for (let it = 0; it < passes; it++) {
		const next = new Float32Array(3 * n)
		for (let c = 0; c < n; c++) {
			if (!isLand[c]) continue
			let sx = D[3 * c]
			let sy = D[3 * c + 1]
			let sz = D[3 * c + 2]
			let m = 1
			for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
				const nb = adjList[k]
				if (!isLand[nb]) continue
				sx += D[3 * nb]
				sy += D[3 * nb + 1]
				sz += D[3 * nb + 2]
				m++
			}
			next[3 * c] = sx / m
			next[3 * c + 1] = sy / m
			next[3 * c + 2] = sz / m
		}
		D = next
	}
	return { D }
}

function pieceTerranes({ params, wp, bent }: PieceTerranesParams): Int32Array {
	const { space, crust, seed } = params
	const n = crust.numCells
	const sub = new Int32Array(n).fill(-1)
	const byPiece = new Map<number, number[]>()
	for (let c = 0; c < n; c++)
		if (wp[c] >= 0) {
			const list = byPiece.get(wp[c]) ?? []
			list.push(c)
			byPiece.set(wp[c], list)
		}
	const cellKm2 = (4 * Math.PI * space.radiusKm ** 2) / n
	const bentAt = (c: number): Vec3 => [
		bent[3 * c],
		bent[3 * c + 1],
		bent[3 * c + 2],
	]
	let next = 0
	for (const p of [...byPiece.keys()].sort((a, b) => a - b)) {
		const cells = byPiece.get(p)!
		const k = Math.max(
			1,
			Math.min(P.subMax, Math.round((cells.length * cellKm2) / P.subAreaKm2)),
		)
		const rng = RNG.makeRng((seed ^ 0x5ab7) + p * 7919)
		const seeds = [cells[Math.floor(rng() * cells.length)]]
		while (seeds.length < k) {
			let best = -1
			let bs = -1
			for (let t = 0; t < 12; t++) {
				const c = cells[Math.floor(rng() * cells.length)]
				const q = bentAt(c)
				let s = Infinity
				for (const s0 of seeds)
					s = Math.min(s, 1 - VEC3.dot({ a: q, b: bentAt(s0) }))
				if (s > bs) {
					bs = s
					best = c
				}
			}
			seeds.push(best)
		}
		const sp = seeds.map(bentAt)
		for (const c of cells) {
			const q = bentAt(c)
			let bi = 0
			let bd = -2
			for (let j = 0; j < sp.length; j++) {
				const d = VEC3.dot({ a: q, b: sp[j] })
				if (d > bd) {
					bd = d
					bi = j
				}
			}
			sub[c] = next + bi
		}
		next += k
	}
	return sub
}

function build(params: BuildBentPiecesParams): BentPieces {
	const { space, crust, seed } = params
	const n = crust.numCells
	const R = space.radiusKm
	const isLand = new Uint8Array(n)
	for (let c = 0; c < n; c++)
		isLand[c] = crust.type[c] !== CRUST.TYPE.OCEAN ? 1 : 0
	const ctx = { params, isLand }
	const tp = landPieces(ctx)
	const mass = SIM_MESH.components({
		space,
		isMember: (c) => isLand[c] === 1,
	}).label
	const { D } = drag(ctx)
	const noise = new SimplexNoise((seed ^ 0xb3d7) >>> 0)
	const fB = R / P.bendBroadKm
	const fF = R / P.bendFineKm
	const aB = P.bendBroadAmpKm / R
	const aF = P.bendFineAmpKm / R
	const { r_xyz } = space.mesh
	const wp = new Int32Array(n).fill(-1)
	const bent = new Float32Array(3 * n)
	const dragKm = new Float32Array(n)
	for (let c = 0; c < n; c++) {
		if (tp[c] < 0) continue
		let p: Vec3 = [r_xyz[3 * c], r_xyz[3 * c + 1], r_xyz[3 * c + 2]]
		dragKm[c] = Math.hypot(D[3 * c], D[3 * c + 1], D[3 * c + 2])
		p = norm([
			p[0] - D[3 * c] / R,
			p[1] - D[3 * c + 1] / R,
			p[2] - D[3 * c + 2] / R,
		])
		let w = tang({
			p,
			w: [
				noise.fbm(p[0] * fB + 11.3, p[1] * fB + 3.1, p[2] * fB + 7.7, 3, 0.5),
				noise.fbm(p[0] * fB + 2.9, p[1] * fB + 17.2, p[2] * fB + 5.5, 3, 0.5),
				noise.fbm(p[0] * fB + 23.4, p[1] * fB + 8.8, p[2] * fB + 13.6, 3, 0.5),
			],
		})
		p = norm([p[0] + aB * w[0], p[1] + aB * w[1], p[2] + aB * w[2]])
		w = tang({
			p,
			w: [
				noise.fbm(p[0] * fF - 5.3, p[1] * fF + 31.1, p[2] * fF + 1.7, 2, 0.5),
				noise.fbm(p[0] * fF + 41.9, p[1] * fF - 7.2, p[2] * fF + 15.5, 2, 0.5),
				noise.fbm(p[0] * fF + 3.4, p[1] * fF + 28.8, p[2] * fF - 23.6, 2, 0.5),
			],
		})
		p = norm([p[0] + aF * w[0], p[1] + aF * w[1], p[2] + aF * w[2]])
		bent[3 * c] = p[0]
		bent[3 * c + 1] = p[1]
		bent[3 * c + 2] = p[2]
		const s = space.nearest({ x: p[0], y: p[1], z: p[2] })
		wp[c] = tp[s] >= 0 && mass[s] === mass[c] ? tp[s] : tp[c]
	}
	const sub = pieceTerranes({ params, wp, bent })
	return { tp, wp, sub, dragKm }
}

export const BENT_PIECES = { build }
