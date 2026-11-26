import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import { DISTRICT_THRESHOLDS } from "@/model/geography/terrain/deposits/districts/thresholds"
import type {
	CalibrateDistrictsParams,
	CreateDistrictsParams,
	DistrictCell,
	DistrictRecipe,
	DistrictShapes,
	DistrictSystem,
	Grain,
	LatLon,
	Lattice,
	LatticeParams,
	Octave,
	SystemShape,
	ThresholdKeyParams,
	WarpedPosition,
} from "@/model/geography/terrain/deposits/districts/types"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import { MATH } from "@/model/shared/math/core"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { HASH } from "@/model/shared/random/hash"

const C = DEPOSIT_CONFIG
const S = C.shapes
const RAD = Math.PI / 180
const NOISE_MAX = 1.05
const SAFE = 1 + 1e-9
const CALIBRATION = { seed: 0x5eed, gridDeg: 1, radiusKm: 6371 }
const MIN_SHARE = 0.005
const MAX_SHARE = 0.9
const EDGE_SHARE = { from: 1.35, to: 0.75, core: 0.15, cap: 0.97 }
const calibrated = new Map<string, number[][]>()

function thresholdKey({ systems, radiusKm }: ThresholdKeyParams): string {
	const text = JSON.stringify([
		radiusKm,
		S,
		systems.map((d) => [d.spacingKm, d.share, d.recipe, d.assoc]),
	])
	return `${(HASH.keyed({ seed: 0, key: text }) >>> 0).toString(16)}-${text.length}`
}

function createLattice({ step, per, fill }: LatticeParams): Lattice {
	const w = Math.round(360 / step)
	const h = Math.round(180 / step) + 1
	const slot = new Int32Array(w * h).fill(-1)
	let data = new Float32Array(per * 1024)
	let used = 0
	const slots = new Int32Array(4)
	const weights = new Float64Array(4)
	const node = (index: number): number => {
		let s = slot[index]
		if (s < 0) {
			s = used++
			slot[index] = s
			if ((s + 1) * per > data.length) {
				const grown = new Float32Array(2 * data.length)
				grown.set(data)
				data = grown
			}
			const j = Math.floor(index / w)
			const i = index % w
			const la = (90 - j * step) * RAD
			const lo = (-180 + i * step) * RAD
			const cl = Math.cos(la)
			fill({
				x: cl * Math.cos(lo),
				y: cl * Math.sin(lo),
				z: Math.sin(la),
				data,
				offset: s * per,
			})
		}
		return s
	}
	const corners = ({ lat, lon }: LatLon): void => {
		const fy = (90 - lat) / step
		const j = Math.min(h - 2, Math.max(0, Math.floor(fy)))
		const ty = Math.min(1, Math.max(0, fy - j))
		const fx = (lon + 180) / step
		const i0f = Math.floor(fx)
		const tx = fx - i0f
		const i0 = ((i0f % w) + w) % w
		const i1 = (i0 + 1) % w
		slots[0] = node(j * w + i0)
		slots[1] = node(j * w + i1)
		slots[2] = node((j + 1) * w + i0)
		slots[3] = node((j + 1) * w + i1)
		weights[0] = (1 - tx) * (1 - ty)
		weights[1] = tx * (1 - ty)
		weights[2] = (1 - tx) * ty
		weights[3] = tx * ty
	}
	return { data: () => data, corners, slots, weights }
}

function build({ seed, systems, gridDeg, radiusKm: R }: CreateDistrictsParams) {
	const n = new SimplexNoise(((seed | 0) * 0x2f3b + 0x91) >>> 0)
	const warpF = S.warpKm.map((km) => R / km)
	const warpA = S.warpAmpKm.map((km) => km / R)
	const warpB = S.warpAmpMaxKm.map((km) => km / R)
	const V = R / S.varyKm
	const e = S.varyEdge
	const bgF = R / S.grainBgKm
	const provF = R / S.provinceKm
	const charF = R / S.characterKm
	const crossF = R / S.crossKm
	const assocs = new Map<string, number>()
	const assocOf = (d: DistrictSystem, i: number): number => {
		const key = d.assoc ?? `own${i}`
		if (!assocs.has(key)) assocs.set(key, assocs.size)
		return assocs.get(key) as number
	}
	const rho = Math.min(1, Math.max(0, S.coupling))
	const kg = Math.sqrt(rho)
	const ka = Math.sqrt(1 - rho)
	const [lo, hi] = S.districtScaleRange.map((k) => k * S.districtScale)
	const shearC = Math.sqrt(S.shearStretch * S.shearStretch - 1)
	const sys: SystemShape[] = systems.map((d, i) => {
		const r = d.recipe
		const fA = R / (d.spacingKm * lo)
		const fB = R / (d.spacingKm * hi)
		const c = Math.sqrt(Math.max(0, r.stretch * r.stretch - 1))
		const off = 17.31 * (i + 1)
		const pair = (fa: number, fb: number, cc: number, o: number): Octave => ({
			small: { f: fa, c: cc, off: o },
			medium: { f: fb, c: cc, off: o + 7.7 },
		})
		return {
			outer: pair(fA, fB, c, off),
			inner: pair(fA * S.octaveRatio, fB * S.octaveRatio, c, off + 5.3),
			shearOctave: pair(
				fA / S.shearSpacing,
				fB / S.shearSpacing,
				shearC,
				off + 41.9,
			),
			alpha: r.alpha,
			prov: r.prov,
			cross: r.cross,
			shear: r.shear,
			share: d.share,
			assoc: assocOf(d, i),
			maxShear: r.shear ? 1 + 1.2 * r.shear : 1,
			t0: 0,
			t1: 0,
			tr: 1,
		}
	})
	const nA = assocs.size
	const aOff = Float64Array.from({ length: nA }, (_, a) => 101.7 * (a + 1))
	const warp = (x: number, y: number, z: number, out: Float64Array) => {
		const tw = MATH.smoothstep({
			edge0: -e,
			edge1: e,
			x: n.noise3D(x * V + 4.4, y * V + 8.3, z * V + 1.2),
		})
		const [f1, f2] = warpF
		const a1 = warpA[0] + (warpB[0] - warpA[0]) * tw
		const a2 = warpA[1] + (warpB[1] - warpA[1]) * tw
		out[0] =
			a1 * n.noise3D(x * f1 + 3.1, y * f1 + 7.7, z * f1 + 1.9) +
			a2 * n.noise3D(x * f2 + 9.4, y * f2 + 2.2, z * f2 + 5.6)
		out[1] =
			a1 * n.noise3D(x * f1 + 4.8, y * f1 + 0.3, z * f1 + 8.1) +
			a2 * n.noise3D(x * f2 + 1.3, y * f2 + 6.5, z * f2 + 3.4)
		out[2] =
			a1 * n.noise3D(x * f1 + 6.6, y * f1 + 5.2, z * f1 + 4.4) +
			a2 * n.noise3D(x * f2 + 8.8, y * f2 + 4.1, z * f2 + 7.3)
	}
	const wp = new Float64Array(3)
	const fine = createLattice({
		step: gridDeg,
		per: 5,
		fill: ({ x, y, z, data, offset }) => {
			warp(x, y, z, wp)
			data[offset] = wp[0]
			data[offset + 1] = wp[1]
			data[offset + 2] = wp[2]
			data[offset + 3] = MATH.smoothstep({
				edge0: -e,
				edge1: e,
				x: n.noise3D(x * V + 6.2, y * V + 0.8, z * V + 9.7),
			})
			data[offset + 4] =
				S.grainBgAmpKm * n.noise3D(x * bgF + 7.1, y * bgF + 3.9, z * bgF + 6.3)
		},
	})
	const coarse = createLattice({
		step: Math.max(1, gridDeg),
		per: 6,
		fill: ({ x, y, z, data, offset }) => {
			warp(x, y, z, wp)
			const wx = x + wp[0]
			const wy = y + wp[1]
			const wz = z + wp[2]
			data[offset] = wx
			data[offset + 1] = wy
			data[offset + 2] = wz
			data[offset + 3] =
				kg > 0
					? kg * n.noise3D(wx * charF + 2.7, wy * charF + 9.9, wz * charF + 0.4)
					: 0
			data[offset + 4] =
				kg > 0
					? kg * n.noise3D(wx * provF + 3.3, wy * provF - 1.7, wz * provF + 0.7)
					: 0
			data[offset + 5] =
				kg > 0
					? kg *
						n.noise3D(wx * crossF + 5.5, wy * crossF + 0.9, wz * crossF + 2.6)
					: 0
		},
	})
	let aData = new Float32Array(3 * nA * 1024)
	let aDone = new Uint8Array(nA * 1024)
	const point = { x: 0, y: 0, z: 0 }
	const place: LatLon = { lat: 0, lon: 0 }
	let pB = 0
	let wB0 = 0
	let pC = 0
	let wC0 = 0
	let ready = false
	let stamp = 0
	let wx = 0
	let wy = 0
	let wz = 0
	let wA = 1
	let wB = 0
	let bound = NOISE_MAX
	const psi = new Float64Array(3)
	const wt = new Float64Array(3)
	let ng = 0
	let norm = 1
	const aPv = new Float64Array(nA)
	const aCr = new Float64Array(nA)
	const aLump = new Float64Array(nA)
	const atCr = new Int32Array(nA).fill(-1)
	const atLump = new Int32Array(nA).fill(-1)
	let innerNoise = 0
	const out: WarpedPosition = { wx: 0, wy: 0, wz: 0 }

	const cell = ({ x, y, z, psiB, wB: weightB, psiC, wC }: DistrictCell) => {
		point.x = x
		point.y = y
		point.z = z
		place.lat = Math.asin(Math.max(-1, Math.min(1, z))) / RAD
		place.lon = Math.atan2(y, x) / RAD
		pB = psiB
		wB0 = weightB
		pC = psiC
		wC0 = wC
		ready = false
		stamp++
	}
	const prepare = () => {
		ready = true
		const fd = fine.data()
		fine.corners(place)
		let dx = 0
		let dy = 0
		let dz = 0
		let ts = 0
		let bg = 0
		for (let k = 0; k < 4; k++) {
			const o = 5 * fine.slots[k]
			const u = fine.weights[k]
			dx += u * fd[o]
			dy += u * fd[o + 1]
			dz += u * fd[o + 2]
			ts += u * fd[o + 3]
			bg += u * fd[o + 4]
		}
		wx = point.x + dx
		wy = point.y + dy
		wz = point.z + dz
		wA = Math.cos(0.5 * Math.PI * ts)
		wB = Math.sin(0.5 * Math.PI * ts)
		coarse.corners(place)
		let g = 0
		const wBg = Math.max(0, 1 - wB0 - wC0)
		if (wB0 > 0.02) {
			psi[g] = pB
			wt[g++] = wB0
		}
		if (wC0 > 0.02) {
			psi[g] = pC
			wt[g++] = wC0
		}
		if (wBg > 0.02 || g === 0) {
			psi[g] = bg
			wt[g] = g === 0 ? 1 : wBg
			g++
		}
		let s2 = 0
		let s1 = 0
		for (let j = 0; j < g; j++) {
			s2 += wt[j] * wt[j]
			s1 += wt[j]
		}
		ng = g
		norm = 1 / Math.sqrt(s2)
		bound =
			(wB < 0.03 || wA < 0.03 ? 1 : wA + wB) *
			(g === 1 ? 1 : s1 * norm) *
			NOISE_MAX
	}
	const assocNode = (slot: number, a: number): number => {
		const k = slot * nA + a
		const o = 3 * k
		if (k >= aDone.length) {
			const done = new Uint8Array(2 * Math.max(k + 1, aDone.length))
			done.set(aDone)
			aDone = done
			const data = new Float32Array(3 * done.length)
			data.set(aData)
			aData = data
		}
		if (aDone[k]) return o
		aDone[k] = 1
		const C = coarse.data()
		const c = 6 * slot
		const px = C[c]
		const py = C[c + 1]
		const pz = C[c + 2]
		const ao = aOff[a]
		let lump = C[c + 3]
		let pv = C[c + 4]
		let cr = C[c + 5]
		if (ka > 0) {
			lump +=
				ka *
				n.noise3D(px * charF + ao, py * charF + 2 * ao, pz * charF + 3 * ao)
			pv +=
				ka *
				n.noise3D(
					px * provF + 1.3 * ao,
					py * provF + 0.7 * ao,
					pz * provF + 2.1 * ao,
				)
			cr +=
				ka *
				n.noise3D(
					px * crossF + 0.6 * ao,
					py * crossF + 1.9 * ao,
					pz * crossF + 1.1 * ao,
				)
		}
		aData[o] = lump
		aData[o + 1] = pv
		aData[o + 2] = cr
		return o
	}
	const assocAt = (a: number) => {
		atLump[a] = stamp
		let l = 0
		let p = 0
		let c = 0
		for (let k = 0; k < 4; k++) {
			const o = assocNode(coarse.slots[k], a)
			const u = coarse.weights[k]
			l += u * aData[o]
			p += u * aData[o + 1]
			c += u * aData[o + 2]
		}
		aLump[a] = 1 + S.character * l
		aPv[a] = p
		aCr[a] = c
	}
	const lumpOf = (a: number): number => {
		if (atLump[a] !== stamp) assocAt(a)
		return aLump[a]
	}
	const pvOf = (a: number): number => {
		if (atLump[a] !== stamp) assocAt(a)
		return aPv[a]
	}
	const crOf = (a: number): number => {
		if (atLump[a] !== stamp) assocAt(a)
		if (atCr[a] !== stamp) {
			atCr[a] = stamp
			aCr[a] = MATH.smoothstep({
				edge0: 1 - S.crossWidth,
				edge1: 1 - 0.25 * S.crossWidth,
				x: 1 - Math.abs(aCr[a]),
			})
		}
		return aCr[a]
	}
	const grained = ({ f, c, off }: Grain): number => {
		const X = wx * f + off
		const Y = wy * f + 2 * off
		const Z = wz * f + 3 * off
		if (ng === 1) return n.noise3D(X, Y, Z + (psi[0] / R) * f * c)
		let s = 0
		for (let j = 0; j < ng; j++)
			s += wt[j] * n.noise3D(X + 1.7 * j, Y, Z + (psi[j] / R) * f * c)
		return s * norm
	}
	const scaled = ({ small, medium }: Octave): number => {
		if (wB < 0.03) return grained(small)
		if (wA < 0.03) return grained(medium)
		return wA * grained(small) + wB * grained(medium)
	}
	const shearOf = (s: SystemShape): number => {
		const l = 1 - Math.abs(scaled(s.shearOctave))
		return (
			1 -
			s.shear +
			s.shear *
				2.2 *
				MATH.smoothstep({
					edge0: 1 - S.shearWidth,
					edge1: 1 - 0.25 * S.shearWidth,
					x: l,
				})
		)
	}
	const value = (k: number): number => {
		if (!ready) prepare()
		const s = sys[k]
		const as = s.assoc
		const a = Math.min(0.92, s.alpha * lumpOf(as))
		const ni = scaled(s.inner)
		let m =
			(1 + s.prov * pvOf(as)) *
			(1 + a * scaled(s.outer)) *
			(1 + S.innerOutline * a * ni)
		innerNoise = ni
		if (s.cross) m *= 1 + s.cross * crOf(as)
		if (s.shear) m *= shearOf(s)
		return m
	}
	const at = (k: number): number => {
		if (!ready) prepare()
		const s = sys[k]
		const as = s.assoc
		const t0 = s.t0
		const iO = S.innerOutline
		const a = Math.min(0.92, s.alpha * lumpOf(as))
		const iMax = 1 + iO * a * bound
		const fP = 1 + s.prov * aPv[as]
		const fC = s.cross ? 1 + s.cross * crOf(as) : 1
		if (Math.abs(fP) * (1 + a * bound) * fC * s.maxShear * iMax * SAFE <= t0)
			return 0
		const fO = 1 + a * scaled(s.outer)
		if (Math.abs(fP * fO) * fC * s.maxShear * iMax * SAFE <= t0) return 0
		const fS = s.shear ? shearOf(s) : 1
		if (Math.abs(fP * fO) * fC * fS * iMax * SAFE <= t0) return 0
		const ni = scaled(s.inner)
		let m = fP * fO * (1 + iO * a * ni)
		if (s.cross) m *= fC
		if (s.shear) m *= fS
		innerNoise = ni
		if (!(m > t0)) return 0
		const core = MATH.smoothstep({
			edge0: s.t1,
			edge1: s.tr,
			x: m * (1 + S.innerGrade * ni),
		})
		return (
			MATH.smoothstep({ edge0: t0, edge1: s.t1, x: m }) *
			(0.45 + 0.55 * core * core)
		)
	}
	const warped = (): WarpedPosition => {
		if (!ready) prepare()
		out.wx = wx
		out.wy = wy
		out.wz = wz
		return out
	}
	const calibrate = (): number[][] => {
		const N = S.calibrationPoints
		const vals = sys.map(() => new Float32Array(N))
		const inner = sys.map(() => new Float32Array(N))
		const golden = Math.PI * (3 - Math.sqrt(5))
		const params: DistrictCell = {
			x: 0,
			y: 0,
			z: 0,
			psiB: 0,
			wB: 0,
			psiC: 0,
			wC: 0,
		}
		for (let i = 0; i < N; i++) {
			const z = 1 - (2 * (i + 0.5)) / N
			const r = Math.sqrt(1 - z * z)
			const th = golden * i
			params.x = r * Math.cos(th)
			params.y = r * Math.sin(th)
			params.z = z
			cell(params)
			for (let k = 0; k < sys.length; k++) {
				vals[k][i] = value(k)
				inner[k][i] = vals[k][i] * (1 + S.innerGrade * innerNoise)
			}
		}
		const quantile = (a: Float32Array, p: number) =>
			a[Math.max(0, Math.min(N - 1, Math.round(p * (N - 1))))]
		return sys.map((s, k) => {
			const a = vals[k].sort()
			const b = inner[k].sort()
			const sh = Math.min(MAX_SHARE, Math.max(MIN_SHARE, s.share))
			const t0 = quantile(a, 1 - Math.min(EDGE_SHARE.cap, EDGE_SHARE.from * sh))
			const t1 = quantile(a, 1 - EDGE_SHARE.to * sh)
			const tr = Math.max(t1 + 1e-6, quantile(b, 1 - EDGE_SHARE.core * sh))
			return [t0, t1, tr]
		})
	}
	return { sys, cell, at, warped, calibrate }
}

function systems(): DistrictSystem[] {
	const district: Readonly<Record<string, readonly number[]>> = C.district
	const recipes: Readonly<Record<string, DistrictRecipe>> = S.recipes
	const recipeOf: Readonly<Record<string, string>> = C.recipeOf
	const associationOf: Readonly<Record<string, string>> = C.associationOf
	return SYSTEMS.list.map((system) => {
		const [spacingKm, share] = district[system.id] ?? district.default
		return {
			spacingKm,
			share,
			recipe: recipes[recipeOf[system.id] ?? recipeOf.default],
			assoc: associationOf[system.id] ?? null,
		}
	})
}

function calibrate({
	systems,
	radiusKm,
}: CalibrateDistrictsParams): number[][] {
	return build({
		seed: CALIBRATION.seed,
		systems,
		gridDeg: CALIBRATION.gridDeg,
		radiusKm,
	}).calibrate()
}

function create({
	seed,
	systems,
	gridDeg,
	radiusKm,
}: CreateDistrictsParams): DistrictShapes {
	const engine = build({ seed, systems, gridDeg, radiusKm })
	const key = thresholdKey({ systems, radiusKm })
	let thresholds = calibrated.get(key)
	if (!thresholds) {
		thresholds =
			DISTRICT_THRESHOLDS.key === key
				? DISTRICT_THRESHOLDS.thresholds
				: calibrate({ systems, radiusKm })
		calibrated.set(key, thresholds)
	}
	engine.sys.forEach((s, k) => {
		;[s.t0, s.t1, s.tr] = thresholds[k]
	})
	return { cell: engine.cell, at: engine.at, warped: engine.warped }
}

export const DISTRICTS = {
	create,
	calibrate,
	thresholdKey,
	systems,
	calibrationRadiusKm: CALIBRATION.radiusKm,
}
