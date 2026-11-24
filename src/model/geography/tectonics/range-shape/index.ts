import { CRUST } from "@/model/geography/tectonics/crust"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import type {
	BeltPart,
	BeltSnapshot,
	Curve,
	FrontChainsParams,
	MaskAtParams,
	MaskBeltParams,
	RangeSegmentsParams,
	RangeStyleKey,
	RangeStyleSpec,
	Raster,
	RasterizeParams,
	RasterSource,
	Segment,
	ShapedRange,
	ShapeRangeParams,
	SidesOfParams,
	SmoothCurveParams,
	StyleForParams,
} from "@/model/geography/tectonics/range-shape/types"
import { SIM_MESH } from "@/model/geography/tectonics/sim-mesh"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { VEC3 } from "@/model/shared/math/vec3"
import type { Vec3 } from "@/model/shared/math/vec3/types"
import { PriorityHeap } from "@/model/shared/min-heap"
import { RNG } from "@/model/shared/random/rng"

const P = PRESENT_CONFIG

const BELT_FIELDS = [
	"upliftKm",
	"rugged",
	"rootKm",
	"thickKm",
	"oroType",
	"oroWork",
	"oroStart",
	"oroLast",
	"beltU",
	"beltReach",
	"beltAt",
	"beltSide",
	"beltShear",
	"prevType",
	"prevLast",
	"prevU",
	"prevReach",
	"prevSide",
	"prevShear",
	"prevRugged",
] as const

const maskNoises = new Map<number, SimplexNoise>()

function softCap({
	x,
	knee,
	max,
}: {
	x: number
	knee: number
	max: number
}): number {
	return x <= knee
		? x
		: knee + (max - knee) * Math.tanh((x - knee) / (max - knee))
}

function lerpPair({
	pair,
	t,
}: {
	pair: readonly [number, number]
	t: number
}): number {
	return pair[0] + (pair[1] - pair[0]) * t
}

function kmBetween({
	a,
	b,
	radiusKm,
}: {
	a: Vec3
	b: Vec3
	radiusKm: number
}): number {
	return VEC3.greatCircleKm({ a, b, radiusKm })
}

function frontChains({ space, cells, minKm }: FrontChainsParams): number[][] {
	const { adjOffset, adjList } = space.mesh
	const inSet = new Set(cells)
	const out: number[][] = []
	const near = (c: number, f: (cell: number) => void) => {
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (inSet.has(nb)) f(nb)
			for (let j = adjOffset[nb]; j < adjOffset[nb + 1]; j++) {
				const nn = adjList[j]
				if (nn !== c && inSet.has(nn)) f(nn)
			}
		}
	}
	const farthest = (from: number, alive: Set<number>) => {
		const d = new Map<number, number>([[from, 0]])
		const prev = new Map<number, number>()
		const heap = new PriorityHeap<number>()
		heap.push(0, from)
		for (let top = heap.pop(); top; top = heap.pop()) {
			const c = top.value
			if (top.key > (d.get(c) ?? Infinity)) continue
			near(c, (nb) => {
				if (!alive.has(nb)) return
				const nd = top.key + SIM_MESH.distanceKm({ space, a: c, b: nb })
				if (nd < (d.get(nb) ?? Infinity)) {
					d.set(nb, nd)
					prev.set(nb, c)
					heap.push(nd, nb)
				}
			})
		}
		let best = from
		let bd = 0
		for (const [c, v] of d)
			if (v > bd || (v === bd && c < best)) {
				bd = v
				best = c
			}
		return { far: best, km: bd, prev, reached: d }
	}
	let alive = new Set([...inSet].sort((a, b) => a - b))
	for (let guard = 0; guard < 8 && alive.size; guard++) {
		const start = Math.min(...alive)
		const a = farthest(start, alive)
		const b = farthest(a.far, alive)
		if (b.km >= minKm || guard === 0) {
			const path = [b.far]
			while (path[path.length - 1] !== a.far)
				path.push(b.prev.get(path[path.length - 1])!)
			if (b.km >= Math.min(minKm, 1)) out.push(path)
			const taken = new Set(path)
			for (const c of path) near(c, (nb) => taken.add(nb))
			for (const c of b.reached.keys()) if (taken.has(c)) alive.delete(c)
		} else for (const c of b.reached.keys()) alive.delete(c)
		alive = new Set([...alive].sort((x, y) => x - y))
	}
	return out
}

function smoothCurve({
	space,
	chain,
	stepKm,
	sigmaKm,
}: SmoothCurveParams): Curve {
	const R = space.radiusKm
	const { r_xyz } = space.mesh
	const raw = chain.map((cell) => VEC3.at({ xyz: r_xyz, cell }))
	const pts: Vec3[] = [raw[0]]
	let carry = 0
	for (let i = 1; i < raw.length; i++) {
		const a = raw[i - 1]
		const b = raw[i]
		const seg = kmBetween({ a, b, radiusKm: R })
		let s = stepKm - carry
		while (s <= seg) {
			const t = s / seg
			pts.push(
				VEC3.unit([
					a[0] + (b[0] - a[0]) * t,
					a[1] + (b[1] - a[1]) * t,
					a[2] + (b[2] - a[2]) * t,
				]),
			)
			s += stepKm
		}
		carry = seg - (s - stepKm)
	}
	const last = raw[raw.length - 1]
	if (
		kmBetween({ a: pts[pts.length - 1], b: last, radiusKm: R }) >
		0.3 * stepKm
	)
		pts.push(last)
	const n = pts.length
	const half = Math.ceil((3 * sigmaKm) / stepKm)
	const out: Vec3[] = []
	for (let i = 0; i < n; i++) {
		const w = Math.min(half, i, n - 1 - i)
		const s: Vec3 = [0, 0, 0]
		for (let j = -w; j <= w; j++) {
			const g = Math.exp(-0.5 * ((j * stepKm) / sigmaKm) ** 2)
			const p = pts[i + j]
			s[0] += g * p[0]
			s[1] += g * p[1]
			s[2] += g * p[2]
		}
		out.push(VEC3.unit(s))
	}
	return { pts: out, km: (n - 1) * stepKm }
}

function rangeSegments({
	space,
	curve,
	style,
	widthKm,
	rng,
}: RangeSegmentsParams): Segment[] {
	const R = space.radiusKm
	const { pts, km } = curve
	const step = km / Math.max(1, pts.length - 1)
	const segs: Segment[] = []
	const [l0, l1] = style.segKm
	const sign = rng() < 0.5 ? -1 : 1
	const angle =
		(sign * lerpPair({ pair: style.echelonDeg, t: rng() }) * Math.PI) / 180
	const bowSign = rng() < 0.5 ? -1 : 1
	let s = 0
	const lengths: [number, number][] = []
	while (s < km) {
		let len = l0 + (l1 - l0) * rng()
		if (km - (s + len * (1 - style.overlap)) < 0.4 * l0)
			len = Math.max(len, km - s)
		lengths.push([s, Math.min(km, s + len)])
		s += len * (1 - style.overlap)
		if (s + 0.4 * l0 >= km) break
	}
	const massif = lengths.length > 1 ? Math.floor(rng() * lengths.length) : 0
	lengths.forEach(([a, b], k) => {
		const strength =
			k === massif ? style.massif : lerpPair({ pair: style.strength, t: rng() })
		const gap = k !== massif && rng() < style.gap
		const offset = (rng() * 2 - 1) * style.offset * widthKm
		if (gap) return
		const i0 = Math.max(0, Math.round(a / step))
		const i1 = Math.min(pts.length - 1, Math.round(b / step))
		if (i1 - i0 < 1) return
		const seg = pts.slice(i0, i1 + 1)
		const mid = seg[Math.floor(seg.length / 2)]
		const first = seg[0]
		const end = seg[seg.length - 1]
		const tan = VEC3.unit([
			end[0] - first[0],
			end[1] - first[1],
			end[2] - first[2],
		])
		const nrm = VEC3.unit(VEC3.cross({ a: mid, b: tan }))
		const segKm = (seg.length - 1) * step
		const sag = bowSign * style.bow * segKm * (0.5 + 0.5 * rng())
		const out = seg.map((p, i) => {
			const q = VEC3.rotateAbout({ p, axis: mid, angle })
			const o =
				offset + sag * Math.sin((Math.PI * i) / Math.max(1, seg.length - 1))
			return VEC3.unit([
				q[0] + (nrm[0] * o) / R,
				q[1] + (nrm[1] * o) / R,
				q[2] + (nrm[2] * o) / R,
			])
		})
		segs.push({
			pts: out,
			t: out.map((_, i) => (out.length > 1 ? i / (out.length - 1) : 0.5)),
			strength,
			width: widthKm * lerpPair({ pair: style.segWidth, t: rng() }),
		})
	})
	return segs
}

function maskAt({ noise, p, f, fw, aw, octaves }: MaskAtParams): number {
	const q: Vec3 = [
		p[0] + aw * noise.fbm(p[0] * fw + 5.2, p[1] * fw, p[2] * fw, 2, 0.5),
		p[1] + aw * noise.fbm(p[0] * fw, p[1] * fw + 9.4, p[2] * fw, 2, 0.5),
		p[2] + aw * noise.fbm(p[0] * fw, p[1] * fw, p[2] * fw - 3.3, 2, 0.5),
	]
	return (
		2 *
		noise.fbm(q[0] * f + 17.1, q[1] * f - 4.4, q[2] * f + 8.8, octaves, 0.55)
	)
}

function maskNoiseOf(seed: number): SimplexNoise {
	let noise = maskNoises.get(seed)
	if (!noise) {
		if (maskNoises.size > 8) maskNoises.clear()
		noise = new SimplexNoise((seed ^ 0x3a55) >>> 0)
		maskNoises.set(seed, noise)
	}
	return noise
}

function beforeBelt(crust: MaskBeltParams["crust"]): BeltSnapshot {
	const out: BeltSnapshot = {}
	for (const key of BELT_FIELDS) out[key] = crust[key].slice()
	return out
}

function maskBelt({ space, crust, was, seed }: MaskBeltParams): void {
	const M = P.rangeMask
	const noise = maskNoiseOf(seed)
	const R = space.radiusKm
	const f = R / M.waveKm
	const fw = R / M.warpWaveKm
	const aw = M.warpKm / R
	const { r_xyz } = space.mesh
	for (let c = 0; c < crust.numCells; c++) {
		if (
			crust.upliftKm[c] === was.upliftKm[c] &&
			crust.rugged[c] === was.rugged[c] &&
			crust.rootKm[c] === was.rootKm[c] &&
			crust.oroLast[c] === was.oroLast[c] &&
			crust.oroType[c] === was.oroType[c]
		)
			continue
		const v = maskAt({
			noise,
			p: VEC3.at({ xyz: r_xyz, cell: c }),
			f,
			fw,
			aw,
			octaves: M.octaves,
		})
		const u = Math.min(1, crust.beltU[c])
		const th = M.near + (M.far - M.near) * u
		const m = Math.min(1, Math.max(0, (v - th) / M.soft + 0.5))
		const s = m * m * (3 - 2 * m)
		const k = softCap({
			x: s * (1 + M.boost * Math.max(0, v)),
			knee: M.kKnee,
			max: M.kMax,
		})
		if (s < M.drop) {
			for (const key of BELT_FIELDS)
				(crust[key] as Float32Array)[c] = was[key][c]
			continue
		}
		crust.upliftKm[c] =
			was.upliftKm[c] + (crust.upliftKm[c] - was.upliftKm[c]) * Math.min(k, s)
		crust.rugged[c] = was.rugged[c] + (crust.rugged[c] - was.rugged[c]) * k
		crust.rootKm[c] =
			was.rootKm[c] + (crust.rootKm[c] - was.rootKm[c]) * Math.min(1, k)
	}
}

function lensWidth({ t, style }: { t: number; style: RangeStyleSpec }): number {
	return (
		style.tipWidth +
		(1 - style.tipWidth) * Math.sin(Math.PI * t) ** style.lensPow
	)
}

function lensWork({ t, style }: { t: number; style: RangeStyleSpec }): number {
	return Math.sin(Math.PI * t) ** style.workPow
}

function lensAmp({ t, style }: { t: number; style: RangeStyleSpec }): number {
	return (
		style.tipAmp + (1 - style.tipAmp) * Math.sin(Math.PI * t) ** style.ampPow
	)
}

function rasterize({
	space,
	segs,
	style,
	workKm,
	ok,
	amp,
	wobble,
}: RasterizeParams): Raster {
	const best = new Map<number, RasterSource>()
	for (const seg of segs) {
		const n = seg.pts.length
		for (let i = 0; i < n; i++) {
			const p = seg.pts[i]
			const c = space.nearest({ x: p[0], y: p[1], z: p[2] })
			if (!ok(c)) continue
			const t = seg.t[i]
			let w = seg.width * lensWidth({ t, style })
			let a = amp * seg.strength * lensAmp({ t, style })
			const k = workKm * lensWork({ t, style })
			if (wobble) {
				const { noise, wF, aF } = wobble
				w *= Math.exp(
					2 *
						style.widthNoise *
						noise.fbm(
							p[0] * wF + 3.1,
							p[1] * wF - 7.7,
							p[2] * wF + 1.9,
							3,
							0.55,
						),
				)
				a *= Math.max(
					0.08,
					1 +
						2 *
							style.ampNoise *
							noise.fbm(
								p[0] * aF - 11.3,
								p[1] * aF + 5.5,
								p[2] * aF - 2.2,
								3,
								0.55,
							),
				)
				if (style.ampMax)
					a = softCap({ x: a, knee: style.ampKnee, max: style.ampMax })
			}
			const was = best.get(c)
			if (!was || w > was.w)
				best.set(c, {
					w,
					k: Math.max(k, was?.k ?? 0),
					a: Math.max(a, was?.a ?? 0),
					pt: p,
					seg,
					i,
				})
			else {
				was.k = Math.max(was.k, k)
				was.a = Math.max(was.a, a)
			}
		}
	}
	const front = [...best.keys()].sort((a, b) => a - b)
	return {
		front,
		widths: front.map((c) => best.get(c)!.w),
		works: front.map((c) => best.get(c)!.k),
		amps: front.map((c) => best.get(c)!.a),
		at: best,
	}
}

function normalAt(e: RasterSource): Vec3 {
	const s = e.seg
	const a = s.pts[Math.max(0, e.i - 1)]
	const b = s.pts[Math.min(s.pts.length - 1, e.i + 1)]
	return VEC3.unit(
		VEC3.cross({
			a: e.pt,
			b: VEC3.unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
		}),
	)
}

function sidesOf({ space, raster, ok, reachKm }: SidesOfParams): Int8Array {
	const { adjOffset, adjList, r_xyz } = space.mesh
	const side = new Int8Array(space.mesh.numRegions)
	const from = new Map<number, { pt: Vec3; nrm: Vec3 }>()
	const q: number[] = []
	for (const c of raster.front) {
		const e = raster.at.get(c)!
		from.set(c, { pt: e.pt, nrm: normalAt(e) })
		q.push(c)
	}
	for (let h = 0; h < q.length; h++) {
		const c = q[h]
		const f = from.get(c)!
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (from.has(nb) || !ok(nb)) continue
			const p = VEC3.at({ xyz: r_xyz, cell: nb })
			if (kmBetween({ a: p, b: f.pt, radiusKm: space.radiusKm }) > reachKm)
				continue
			from.set(nb, f)
			q.push(nb)
			side[nb] = VEC3.dot({ a: p, b: f.nrm }) >= 0 ? 1 : -1
		}
	}
	return side
}

function styleFor({ ev, rng }: StyleForParams): RangeStyleKey {
	const weights: Record<string, number> =
		ev.kind === "weld"
			? ev.age < P.plateauBelowMyr
				? P.rangeStyleWeights.weldYoung
				: P.rangeStyleWeights.weld
			: P.rangeStyleWeights[ev.kind]
	const keys = Object.keys(weights).sort()
	const total = keys.reduce((s, k) => s + weights[k], 0)
	let r = rng() * total
	for (const k of keys) {
		r -= weights[k]
		if (r <= 0) return k as RangeStyleKey
	}
	return keys[keys.length - 1] as RangeStyleKey
}

function orogenyCode(name: string): number {
	return CRUST.OROGENY_KINDS.indexOf(
		name as (typeof CRUST.OROGENY_KINDS)[number],
	)
}

function sideCode(name: string): number {
	return CRUST.SIDE[name.toUpperCase() as keyof typeof CRUST.SIDE]
}

function shapeRange({
	space,
	ev,
	ok,
	widthKm,
	seed,
}: ShapeRangeParams): ShapedRange {
	const R = space.radiusKm
	const { r_xyz } = space.mesh
	const rng = RNG.makeRng(
		(seed ^ 0x7a6e) +
			ev.front[0] * 131 +
			ev.front.length * 7 +
			Math.round(ev.age),
	)
	const styleKey = styleFor({ ev, rng })
	const style = {
		...P.rangeShape,
		...P.rangeStyles[styleKey],
	} as RangeStyleSpec
	const width = widthKm * lerpPair({ pair: style.width, t: rng() })
	const work = ev.work * lerpPair({ pair: style.work, t: rng() })
	const amp = lerpPair({ pair: style.amp, t: rng() })
	const segs: Segment[] = []
	for (const chain of frontChains({
		space,
		cells: ev.front,
		minKm: P.rangeMinKm,
	})) {
		let len = 0
		for (let i = 1; i < chain.length; i++)
			len += SIM_MESH.distanceKm({ space, a: chain[i - 1], b: chain[i] })
		const curve = smoothCurve({
			space,
			chain,
			stepKm: P.rangeStepKm,
			sigmaKm: Math.max(
				style.smoothMinKm,
				style.smooth * width,
				style.smoothShare * len,
			),
		})
		if (curve.km < (styleKey === "knots" ? P.rangeKnotMinKm : P.rangeMinKm))
			continue
		segs.push(...rangeSegments({ space, curve, style, widthKm: width, rng }))
	}
	const wobble = {
		noise: new SimplexNoise(((seed ^ 0x6f1e) + ev.front[0] * 31) >>> 0),
		wF: R / style.widthNoiseKm,
		aF: R / style.ampNoiseKm,
	}
	const raster = rasterize({
		space,
		segs,
		style,
		workKm: work,
		ok: ok.source,
		amp,
		wobble,
	})
	const parts: BeltPart[] = []
	if (raster.front.length >= 2) {
		if (style.sides) {
			const side = sidesOf({
				space,
				raster,
				ok: ok.reach,
				reachKm: 1.2 * width * style.segWidth[1],
			})
			const upLeft = ev.upper ? ev.upper(side) >= 0 : rng() < 0.5
			const own = raster.front.map((c) =>
				VEC3.dot({
					a: VEC3.at({ xyz: r_xyz, cell: c }),
					b: normalAt(raster.at.get(c)!),
				}) >= 0
					? 1
					: -1,
			)
			style.sides.forEach((spec, j) => {
				if (!spec.share) return
				const want = (j === 0) === upLeft ? 1 : -1
				const idx: number[] = []
				raster.front.forEach((_, i) => {
					if (own[i] === want) idx.push(i)
				})
				if (idx.length < 2) return
				parts.push({
					type: orogenyCode(spec.type),
					side: sideCode(spec.side),
					front: idx.map((i) => raster.front[i]),
					widths: idx.map((i) => raster.widths[i] * spec.share),
					works: idx.map((i) => raster.works[i]),
					amps: idx.map((i) => raster.amps[i]),
					shear: 0,
					allow: (c) => ok.reach(c) && side[c] !== -want,
				})
			})
		} else
			parts.push({
				type: orogenyCode(style.type!),
				side: CRUST.SIDE.NONE,
				front: raster.front,
				widths: raster.widths,
				works: raster.works,
				amps: raster.amps,
				shear: 0,
				allow: ok.reach,
			})
	}
	return { style: styleKey, parts, front: raster.front, works: raster.works }
}

export const RANGE_SHAPE = { shapeRange, maskBelt, beforeBelt }
