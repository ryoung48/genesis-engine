import { CRUST } from "@/model/geography/tectonics/crust"
import type {
	MassParams,
	PastContext,
	PastRecord,
	PieceInfo,
	ReplayPastParams,
	WearParams,
} from "@/model/geography/tectonics/crust-past/types"
import { OROGENY } from "@/model/geography/tectonics/orogeny"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import { RANGE_SHAPE } from "@/model/geography/tectonics/range-shape"
import { SIM_MESH } from "@/model/geography/tectonics/sim-mesh"
import { TECTONIC_CONFIG } from "@/model/geography/tectonics/tectonic-config"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { VEC3 } from "@/model/shared/math/vec3"
import { PriorityHeap } from "@/model/shared/min-heap"
import { RNG } from "@/model/shared/random/rng"

const P = PRESENT_CONFIG
const W = P.wear
const H = TECTONIC_CONFIG.heights

function lerpPair({
	pair,
	t,
}: {
	pair: readonly [number, number]
	t: number
}): number {
	return pair[0] + (pair[1] - pair[0]) * t
}

function erosionAtHeight(heightKm: number): number {
	const { refKm, floor, max } = W.erosionHeight
	const x = heightKm / refKm
	return x <= 1 ? Math.max(floor, x) : Math.min(max, Math.sqrt(x))
}

function wear({ crust, dtMyr }: WearParams): void {
	if (!(dtMyr > 0)) return
	const steps = Math.max(1, Math.ceil(dtMyr / P.wearStepMyr))
	const s = dtMyr / steps
	for (let c = 0; c < crust.numCells; c++) {
		if (!crust.oroType[c] && !crust.prevType[c]) continue
		let up = crust.upliftKm[c]
		let root = crust.rootKm[c]
		let kr = 1
		const arc = crust.type[c] === CRUST.TYPE.ARC ? H.arcUpliftShare : 1
		for (let k = 0; k < steps; k++) {
			const height =
				Math.max(0, up) +
				W.isoMaxKm * (1 - Math.exp((-root * arc) / W.isoScaleKm))
			const e = s * (up < 0 ? 1 : erosionAtHeight(height))
			up *= Math.exp(-e / W.reliefTauMyr)
			root *= Math.exp(-e / W.thickTauMyr)
			kr *= Math.exp(-e / W.ruggedTauMyr)
		}
		crust.upliftKm[c] = up
		crust.rootKm[c] = root
		crust.rugged[c] *= kr
		crust.prevRugged[c] *= kr
	}
}

function coastOk({
	ctx,
	cell,
	km,
}: {
	ctx: PastContext
	cell: number
	km: number
}): boolean {
	return ctx.toSea[cell] >= km
}

function piecesOf({ ctx, cells, index }: MassParams): Map<number, PieceInfo> {
	const tp = ctx.pieces.wp
	const { adjOffset, adjList } = ctx.space.mesh
	const pcs = new Map<number, PieceInfo>()
	for (const c of cells) {
		const p = tp[c]
		if (p < 0) continue
		let e = pcs.get(p)
		if (!e) {
			e = { cells: [], inland: 0, nbr: new Set() }
			pcs.set(p, e)
		}
		e.cells.push(c)
		e.inland += ctx.toSea[c]
	}
	for (const c of cells)
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (
				ctx.mass[nb] === index &&
				tp[nb] !== tp[c] &&
				tp[nb] >= 0 &&
				tp[c] >= 0
			)
				pcs.get(tp[c])!.nbr.add(tp[nb])
		}
	return pcs
}

function pickCores({
	list,
	pcs,
	k,
	rng,
}: {
	list: number[]
	pcs: Map<number, PieceInfo>
	k: number
	rng: () => number
}): number[] {
	const hops = (from: number) => {
		const d = new Map<number, number>([[from, 0]])
		const q = [from]
		for (let h = 0; h < q.length; h++)
			for (const j of pcs.get(q[h])!.nbr)
				if (!d.has(j)) {
					d.set(j, d.get(q[h])! + 1)
					q.push(j)
				}
		return d
	}
	const inland = (p: number) => pcs.get(p)!.inland / pcs.get(p)!.cells.length
	const jitter = new Map(list.map((p) => [p, 0.85 + 0.3 * rng()]))
	const coreP: number[] = []
	for (let i = 0; i < k; i++) {
		const far = coreP.map(hops)
		let best = -1
		let bs = -1
		for (const p of list) {
			if (coreP.includes(p) || far.some((d) => (d.get(p) ?? 99) < 2)) continue
			const s = inland(p) * jitter.get(p)!
			if (s > bs) {
				bs = s
				best = p
			}
		}
		if (best < 0) break
		coreP.push(best)
	}
	return coreP
}

function dockOrder({
	ctx,
	list,
	pcs,
	coreP,
}: {
	ctx: PastContext
	list: number[]
	pcs: Map<number, PieceInfo>
	coreP: number[]
}): { pDist: Map<number, number>; pCore: Map<number, number> } {
	const { r_xyz } = ctx.space.mesh
	const mid = new Map<number, ReturnType<typeof VEC3.unit>>()
	for (const p of list) {
		const s: [number, number, number] = [0, 0, 0]
		for (const c of pcs.get(p)!.cells) {
			s[0] += r_xyz[3 * c]
			s[1] += r_xyz[3 * c + 1]
			s[2] += r_xyz[3 * c + 2]
		}
		mid.set(p, VEC3.unit(s))
	}
	const pDist = new Map<number, number>()
	const pCore = new Map<number, number>()
	const heap = new PriorityHeap<number>()
	coreP.forEach((p, i) => {
		pDist.set(p, 0)
		pCore.set(p, i)
		heap.push(0, p)
	})
	for (let top = heap.pop(); top; top = heap.pop()) {
		const p = top.value
		if (top.key > pDist.get(p)!) continue
		for (const j of pcs.get(p)!.nbr) {
			const nd =
				top.key +
				VEC3.greatCircleKm({
					a: mid.get(p)!,
					b: mid.get(j)!,
					radiusKm: ctx.space.radiusKm,
				})
			if (nd < (pDist.get(j) ?? Infinity)) {
				pDist.set(j, nd)
				pCore.set(j, pCore.get(p)!)
				heap.push(nd, j)
			}
		}
	}
	return { pDist, pCore }
}

function massEvents({ ctx, cells, index }: MassParams): void {
	const { space, crust, pieces, seed } = ctx
	const { adjOffset, adjList } = space.mesh
	const n = crust.numCells
	const tp = pieces.wp
	const sub = pieces.sub
	const cellKm2 = (4 * Math.PI * space.radiusKm ** 2) / n
	const areaKm2 = cells.length * cellKm2
	const rng = RNG.makeRng((seed ^ 0x7a57) + index * 7919)
	if (areaKm2 < P.pastMinAreaKm2) {
		const id = ctx.nextTerrane++
		for (const c of cells) ctx.terrane[c] = id
		ctx.terraneAge.set(id, P.youngestRingMyr)
		return
	}
	const inMass = (c: number) => ctx.mass[c] === index
	const pcs = piecesOf({ ctx, cells, index })
	const list = [...pcs.keys()].sort((a, b) => a - b)
	const k = Math.max(
		1,
		Math.min(P.maxCores, list.length, Math.round(areaKm2 / P.coreAreaKm2)),
	)
	const coreP = pickCores({ list, pcs, k, rng })
	const coreAge = coreP.map(() => lerpPair({ pair: P.coreAgeMyr, t: rng() }))
	const { pDist, pCore } = dockOrder({ ctx, list, pcs, coreP })
	const ringKm = lerpPair({ pair: P.ringKm, t: rng() })
	const ageOf = new Map<number, number>()
	const ringOfP = new Map<number, number>()
	const outerRing = coreP.map(() => 1)
	for (const p of list) {
		if (!pCore.has(p)) {
			ringOfP.set(p, 99)
			continue
		}
		const ring = coreP.includes(p) ? 0 : 1 + Math.floor(pDist.get(p)! / ringKm)
		ringOfP.set(p, ring)
		outerRing[pCore.get(p)!] = Math.max(outerRing[pCore.get(p)!], ring)
	}
	const outerAge = coreP.map((p, i) =>
		lerpPair({
			pair: P.outerRingMyr,
			t: RNG.makeRng((seed ^ 0x0a6e) + p * 7919 + i)(),
		}),
	)
	for (const p of list) {
		const ring = ringOfP.get(p)!
		const kc = pCore.get(p)
		if (kc === undefined) {
			ageOf.set(p, P.youngestRingMyr)
			continue
		}
		const span = coreAge[kc] - outerAge[kc]
		const f = ring
			? Math.min(
					1,
					(ring / outerRing[kc]) ** P.ringAgePow * (0.85 + 0.3 * rng()),
				)
			: 0
		ageOf.set(p, coreAge[kc] - span * f)
	}
	for (const p of coreP)
		for (const c of pcs.get(p)!.cells)
			if (
				crust.type[c] === CRUST.TYPE.CONTINENT &&
				ctx.inFromEdge[c] >= P.coreRimKm &&
				coastOk({ ctx, cell: c, km: P.coreCoastKm })
			)
				crust.type[c] = CRUST.TYPE.CRATON
	for (const p of list) {
		const id = ctx.nextTerrane++
		for (const c of pcs.get(p)!.cells) {
			ctx.terrane[c] = id
			ctx.coreOf[c] = pCore.get(p) ?? -1
		}
		ctx.terraneAge.set(id, ageOf.get(p)!)
	}
	ctx.cores += coreP.length

	for (const p of list) {
		if (!pDist.has(p) || coreP.includes(p)) continue
		const front: number[] = []
		for (const c of pcs.get(p)!.cells) {
			if (!coastOk({ ctx, cell: c, km: P.pastCoastKm })) continue
			for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
				const nb = adjList[j]
				const q = tp[nb]
				if (
					inMass(nb) &&
					q !== p &&
					q >= 0 &&
					pCore.get(q) === pCore.get(p) &&
					(pDist.get(q) ?? Infinity) < pDist.get(p)!
				) {
					front.push(c)
					break
				}
			}
		}
		if (front.length < 2) continue
		const work = lerpPair({ pair: P.ringWorkKm, t: rng() })
		const quiet = RNG.makeRng((seed ^ 0x9d0c) + p * 7919)() < P.ringQuietShare
		ctx.events.push({
			age: ageOf.get(p)!,
			kind: "ring",
			front,
			outline: front,
			work,
			allow: inMass,
			strength: quiet ? 0 : 1,
			parts: [],
			works: [],
		})
	}

	for (const p of list) {
		const seams = new Map<number, number[]>()
		for (const c of pcs.get(p)!.cells) {
			if (
				!coastOk({ ctx, cell: c, km: P.pastCoastKm }) ||
				crust.type[c] === CRUST.TYPE.CRATON
			)
				continue
			for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
				const nb = adjList[j]
				if (tp[nb] !== p || sub[nb] === sub[c]) continue
				const key = Math.min(sub[c], sub[nb]) * 4096 + Math.max(sub[c], sub[nb])
				const list2 = seams.get(key) ?? []
				list2.push(c)
				seams.set(key, list2)
				break
			}
		}
		for (const key of [...seams.keys()].sort((a, b) => a - b)) {
			const front = seams.get(key)!
			if (front.length < 2) continue
			const r = RNG.makeRng((seed ^ 0x5b5e) + key)
			const hi = Math.min(
				P.subAgeMyr[1],
				(ageOf.get(p) ?? P.subAgeMyr[1]) + P.subOlderMyr,
			)
			const lo = Math.log(P.subAgeMyr[0])
			const age = Math.exp(
				lo + (Math.log(Math.max(P.subAgeMyr[0] + 1, hi)) - lo) * r(),
			)
			ctx.events.push({
				age,
				kind: "sub",
				front,
				outline: front,
				work: lerpPair({ pair: P.subWorkKm, t: r() }),
				allow: inMass,
				strength: 1,
				parts: [],
				works: [],
			})
		}
	}

	const pairs = new Map<number, number[]>()
	for (const c of cells)
		for (let j = adjOffset[c]; j < adjOffset[c + 1]; j++) {
			const nb = adjList[j]
			if (
				!inMass(nb) ||
				nb < c ||
				ctx.coreOf[nb] < 0 ||
				ctx.coreOf[c] < 0 ||
				ctx.coreOf[nb] === ctx.coreOf[c]
			)
				continue
			const key =
				Math.min(ctx.coreOf[c], ctx.coreOf[nb]) * 64 +
				Math.max(ctx.coreOf[c], ctx.coreOf[nb])
			const seam = pairs.get(key) ?? []
			seam.push(c, nb)
			pairs.set(key, seam)
		}
	const weights = coreP.map((p) => pcs.get(p)!.cells.length)
	const pairList = [...pairs.entries()].sort((a, b) => a[0] - b[0])
	pairList.forEach(([key, seam], j) => {
		const last = j === pairList.length - 1
		const age = last
			? lerpPair({ pair: P.lastWeldMyr, t: rng() })
			: lerpPair({ pair: P.weldMyr, t: rng() })
		const work = lerpPair({ pair: P.weldWorkKm, t: rng() })
		const i0 = Math.floor(key / 64)
		const i1 = key % 64
		const big = weights[i0] >= weights[i1] ? i0 : i1
		const front = [
			...new Set(
				seam.filter((c) => coastOk({ ctx, cell: c, km: P.pastCoastKm })),
			),
		].sort((a, b) => a - b)
		if (front.length < 2) return
		ctx.events.push({
			age,
			kind: "weld",
			front,
			outline: front,
			work,
			allow: inMass,
			strength: last ? 1 : P.innerWeldShare,
			parts: [],
			works: [],
			upper: (side) => {
				let s = 0
				for (const c of cells)
					if (side[c] && ctx.coreOf[c] === big) s += side[c]
				return s
			},
		})
	})
}

function swells({
	ctx,
	seamMajor,
	seamRing,
	seamSub,
}: {
	ctx: PastContext
	seamMajor: Uint8Array
	seamRing: Uint8Array
	seamSub: Uint8Array
}): Float32Array {
	const { space, crust, land, toSea, seed } = ctx
	const n = crust.numCells
	const { r_xyz } = space.mesh
	const noise = new SimplexNoise((seed ^ 0x9a57) >>> 0)
	const reach = (mark: Uint8Array) =>
		SIM_MESH.dijkstra({
			space,
			isSource: (c) => mark[c] === 1,
			canEnter: (c) => land[c] === 1,
			maxKm: Infinity,
			carry: () => 0,
		}).km
	const toMajor = reach(seamMajor)
	const toRing = reach(seamRing)
	const toSub = reach(seamSub)
	const seamKm = new Float32Array(n)
	const g = (d: number, s: number) =>
		d < Infinity ? Math.exp(-0.5 * (d / s) ** 2) : 0
	const f = space.radiusKm / 2200
	for (let c = 0; c < n; c++) {
		if (!land[c]) continue
		seamKm[c] = Math.min(toMajor[c], toRing[c])
		let b =
			P.swellMajorKm * g(toMajor[c], P.swellMajorWidthKm) +
			P.swellRingKm * g(toRing[c], P.swellRingWidthKm) +
			P.swellSubKm * g(toSub[c], P.swellSubWidthKm)
		const x = r_xyz[3 * c]
		const y = r_xyz[3 * c + 1]
		const z = r_xyz[3 * c + 2]
		b +=
			P.swellNoiseKm *
				noise.noise3D(x * f + 21.1, y * f - 21.1, z * f + 10.55) +
			P.swellFloorKm
		if (crust.type[c] === CRUST.TYPE.CRATON) b *= 0.5
		b *= Math.min(
			1,
			Math.max(0, (toSea[c] - 0.3 * P.pastCoastKm) / P.pastCoastKm),
		)
		crust.baseKm[c] = Math.max(0, b)
		crust.terrane[c] = ctx.terrane[c]
	}
	return seamKm
}

function shapeEvents({ ctx }: { ctx: PastContext }): {
	seamMajor: Uint8Array
	seamRing: Uint8Array
	seamSub: Uint8Array
} {
	const { space, land, seed } = ctx
	const n = ctx.crust.numCells
	const seamMajor = new Uint8Array(n)
	const seamRing = new Uint8Array(n)
	const seamSub = new Uint8Array(n)
	for (const ev of ctx.events) {
		const work = ev.work * ev.strength
		if (!(work > 0)) continue
		const width = Math.min(
			TECTONIC_CONFIG.belts.ural.maxKm,
			OROGENY.beltWidthKm({
				kind: "ural",
				workKm: work,
				rateCmYr: P.pastRateCmYr,
			}),
		)
		const shaped = RANGE_SHAPE.shapeRange({
			space,
			ev: { ...ev, work },
			ok: {
				source: (c) =>
					land[c] === 1 &&
					ev.allow(c) &&
					coastOk({ ctx, cell: c, km: P.pastCoastKm }),
				reach: ev.allow,
			},
			widthKm: width,
			seed,
		})
		ev.parts = shaped.parts
		ev.front = shaped.front
		ev.works = shaped.works
		const mark =
			ev.kind === "weld" ? seamMajor : ev.kind === "sub" ? seamSub : seamRing
		if (ev.parts.length) for (const c of ev.front) mark[c] = 1
	}
	return { seamMajor, seamRing, seamSub }
}

function replay({ space, crust, pieces, seed }: ReplayPastParams): PastRecord {
	const n = crust.numCells
	const land = new Uint8Array(n)
	for (let c = 0; c < n; c++)
		land[c] = crust.type[c] !== CRUST.TYPE.OCEAN ? 1 : 0
	const toSea = SIM_MESH.dijkstra({
		space,
		isSource: (c) => land[c] === 0,
		canEnter: () => true,
		maxKm: Infinity,
		carry: () => 0,
	}).km
	const tp = pieces.wp
	const { adjOffset, adjList } = space.mesh
	const inFromEdge = SIM_MESH.dijkstra({
		space,
		isSource: (c) => {
			if (!land[c]) return false
			for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
				const nb = adjList[k]
				if (land[nb] && tp[nb] !== tp[c]) return true
			}
			return false
		},
		canEnter: (c) => land[c] === 1,
		maxKm: Infinity,
		carry: () => 0,
	}).km
	const comps = SIM_MESH.components({ space, isMember: (c) => land[c] === 1 })
	const ctx: PastContext = {
		space,
		crust,
		pieces,
		seed,
		land,
		toSea,
		inFromEdge,
		mass: comps.label,
		masses: comps.cells,
		terrane: new Int32Array(n),
		coreOf: new Int32Array(n).fill(-1),
		terraneAge: new Map(),
		events: [],
		nextTerrane: 1,
		cores: 0,
	}
	ctx.masses.forEach((cells, index) => massEvents({ ctx, cells, index }))
	ctx.events.sort((a, b) => b.age - a.age || a.front[0] - b.front[0])
	const marks = shapeEvents({ ctx })
	let clock = -Infinity
	for (const ev of ctx.events) {
		const t = -ev.age
		if (clock > -Infinity) wear({ crust, dtMyr: t - clock })
		clock = t
		for (const c of ev.outline) crust.flags[c] |= CRUST.FLAG.SUTURE
		if (!ev.parts.length) continue
		const was = RANGE_SHAPE.beforeBelt(crust)
		for (const part of ev.parts)
			OROGENY.spreadBelt({
				space,
				crust,
				sources: part.front,
				belt: {
					type: part.type,
					time: t,
					side: part.side,
					widths: part.widths,
					works: part.works,
					shears: part.front.map(() => part.shear),
					amps: part.amps,
				},
				allow: part.allow,
			})
		RANGE_SHAPE.maskBelt({ space, crust, was, seed })
		const tf = Math.fround(t)
		for (const c of ev.front)
			if (crust.oroLast[c] === tf && crust.oroStart[c] === tf)
				crust.oroStart[c] = t - P.pastEventMyr
	}
	if (clock > -Infinity) wear({ crust, dtMyr: 0 - clock })
	const seamKm = swells({ ctx, ...marks })
	return {
		events: ctx.events,
		terraneAge: ctx.terraneAge,
		seamKm,
		cores: ctx.cores,
	}
}

export const CRUST_PAST = { replay }
