import { CRUST } from "@/model/geography/tectonics/crust"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import { ARC_HEIGHTS } from "@/model/geography/terrain/arc-heights"
import type {
	BuildEdificesParams,
	ConeAtParams,
	Edifice,
	HotspotSitesParams,
	StampEdificesParams,
	StampResult,
	VolcanoKind,
	VolcanoSite,
} from "@/model/geography/terrain/volcano-edifices/types"
import { MESH } from "@/model/mesh"
import { MATH } from "@/model/shared/math/core"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { VEC3 } from "@/model/shared/math/vec3"
import type { Vec3 } from "@/model/shared/math/vec3/types"
import { RNG } from "@/model/shared/random/rng"

const P = PRESENT_CONFIG
const V = P.volcano
const TAU = 2 * Math.PI
const MAX_ARMS = 3
const LOBES = 0
const ARM_COUNT = 8
const ARMS = 9
const RIBS = 21
const RIB_DEPTH = 29
const COLLAPSE = 30
const WOBBLE = 33
const NOISE = 34
const STRIDE = 36
const SALT: Record<VolcanoKind, number> = {
	hotspot: 101,
	arc: 102,
	andean: 103,
}
const KIND_CODE: Record<VolcanoKind, number> = { arc: 1, andean: 2, hotspot: 3 }
const ACTIVITY_WEIGHT: Record<VolcanoKind, number> = {
	arc: 0.9,
	andean: 0.9,
	hotspot: 0.6,
}

function smooth({ a, b, x }: { a: number; b: number; x: number }): number {
	return MATH.smoothstep({ edge0: a, edge1: b, x })
}

function between({
	rng,
	pair,
}: {
	rng: () => number
	pair: readonly [number, number]
}): number {
	return pair[0] + (pair[1] - pair[0]) * rng()
}

function smoothMax({ a, b }: { a: number; b: number }): number {
	if (a <= 0 || b <= 0) return Math.max(a, b)
	const m = Math.max(a, b)
	const x = a / m
	const y = b / m
	return m * (x ** 8 + y ** 8) ** 0.125
}

function tangent({ p, v }: { p: Vec3; v: Vec3 }): Vec3 {
	const d = VEC3.dot({ a: v, b: p })
	const t: Vec3 = [v[0] - d * p[0], v[1] - d * p[1], v[2] - d * p[2]]
	if (Math.hypot(t[0], t[1], t[2]) > 1e-9) return VEC3.unit(t)
	return tangent({ p, v: Math.abs(p[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0] })
}

function turn({ p, e, angle }: { p: Vec3; e: Vec3; angle: number }): Vec3 {
	const q = VEC3.cross({ a: p, b: e })
	const c = Math.cos(angle)
	const s = Math.sin(angle)
	return [e[0] * c + q[0] * s, e[1] * c + q[1] * s, e[2] * c + q[2] * s]
}

function hotspotSites({ crust, seaAgeMyr }: HotspotSitesParams): VolcanoSite[] {
	const sites: VolcanoSite[] = []
	for (let c = 0; c < crust.numCells; c++) {
		if (
			crust.volcType[c] !== CRUST.VOLCANIC.TRACK ||
			crust.type[c] !== CRUST.TYPE.OCEAN ||
			crust.volcKm[c] < P.seamountKm
		)
			continue
		const h = crust.volcKm[c] - crust.volcWornKm[c]
		if (h < V.hotspotMinKm) continue
		sites.push({
			cell: c,
			kind: "hotspot",
			heightKm: h,
			radiusKm: 25 + 25 * Math.sqrt(h),
			ageMyr: crust.volcWornKm[c] / P.islandErosionKmPerMyr,
			strike: null,
			floorKm: -ARC_HEIGHTS.seaDepthKm(seaAgeMyr[c]),
			active: -crust.volcAt[c] < P.activeMyr,
		})
	}
	return sites
}

function build({
	space,
	sites,
	seed,
	meshEdgeKm,
}: BuildEdificesParams): Edifice[] {
	const { r_xyz } = space.mesh
	const R = space.radiusKm
	const out: Edifice[] = []

	const place = ({
		kind,
		rng,
		pos,
		axis,
		heightKm,
		radiusKm,
		rounded,
		floorKm,
		active,
		armsFrom,
	}: {
		kind: VolcanoKind
		rng: () => number
		pos: Vec3
		axis: Vec3
		heightKm: number
		radiusKm: number
		rounded: number
		floorKm: number | null
		active: boolean
		armsFrom: readonly [number, number] | null
	}) => {
		const a = 1 + V.coneElongation[kind] * rng()
		const sa = Math.sqrt(a)
		const s = new Float32Array(STRIDE)
		for (let i = 0; i < 3; i++) {
			s[LOBES + i] = V.coneLobes * rng()
			s[LOBES + 3 + i] = rng() * TAU
		}
		s[LOBES + 6] = V.coneLobesFine * rng()
		s[LOBES + 7] = rng() * TAU
		const [lo, hi] = armsFrom ?? V.coneArms[kind]
		const count = Math.min(MAX_ARMS, lo + Math.floor(rng() * (hi - lo + 1)))
		const start = rng() * TAU
		s[ARM_COUNT] = count
		for (let i = 0; i < count; i++) {
			const angle =
				kind === "hotspot"
					? start + (TAU * i) / count + (rng() * 2 - 1) * 0.5
					: (i % 2) * Math.PI + (rng() * 2 - 1) * 0.35
			s[ARMS + 4 * i] = angle
			s[ARMS + 4 * i + 1] = between({ rng, pair: V.coneArmLength[kind] })
			s[ARMS + 4 * i + 2] = between({ rng, pair: V.coneArmWidth })
			s[ARMS + 4 * i + 3] = between({ rng, pair: V.coneArmHeight })
		}
		const N = Math.round(between({ rng, pair: V.coneRibCount }))
		s[RIBS] = N
		s[RIBS + 1] = rng() * TAU
		s[RIBS + 2] = 0.6 + 0.8 * rng()
		s[RIBS + 3] = rng() * TAU
		s[RIBS + 4] = 0.4 + 0.6 * rng()
		s[RIBS + 5] = rng() * TAU
		s[RIBS + 6] = 0.5 + rng()
		s[RIBS + 7] = rng() * TAU
		s[RIB_DEPTH] =
			V.coneRibs.young + (V.coneRibs.worn - V.coneRibs.young) * rounded
		if (rng() < V.coneCollapse[kind]) {
			s[COLLAPSE] = rng() * TAU
			s[COLLAPSE + 1] = 0.35 + 0.35 * rng()
			s[COLLAPSE + 2] = between({ rng, pair: V.coneCollapseDepth })
		}
		s[WOBBLE] = rng() * TAU
		s[NOISE] = rng() * 200
		s[NOISE + 1] = rng() * 200
		let far =
			1 + s[LOBES] + s[LOBES + 1] + s[LOBES + 2] + s[LOBES + 6] + V.coneWarp
		for (let i = 0; i < count; i++)
			far = Math.max(
				far,
				s[ARMS + 4 * i + 1] + 2.5 * s[ARMS + 4 * i + 2] + V.coneWarp,
			)
		out.push({
			kind,
			active,
			pos,
			axis,
			heightKm,
			radiusKm,
			rounded,
			aspect: a,
			reachKm: radiusKm * sa * far,
			ribFade: smooth({
				a: V.minWavesPerCell,
				b: V.fullWavesPerCell,
				x: (TAU * 0.6 * radiusKm) / N / meshEdgeKm,
			}),
			floorKm,
			shape: s,
		})
		return { s, sa }
	}

	for (const site of sites) {
		const rng = RNG.makeRng(
			((seed ^ 0x5a10) + site.cell * 7919 + SALT[site.kind] * 131) >>> 0,
		)
		const f = 1 - Math.exp(-Math.max(0, site.ageMyr) / V.coneSpreadMyr)
		const h = site.heightKm * (1 - V.coneSettle * f)
		const r = Math.max(
			site.radiusKm * (1 + V.coneSpread * f),
			V.minRadiusMeshEdges * meshEdgeKm,
		)
		const j = V.jitterKm[site.kind] / R
		const local = VEC3.unit([
			r_xyz[3 * site.cell] + (rng() * 2 - 1) * j,
			r_xyz[3 * site.cell + 1] + (rng() * 2 - 1) * j,
			r_xyz[3 * site.cell + 2] + (rng() * 2 - 1) * j,
		])
		let e: Vec3
		if (site.strike) {
			e = turn({
				p: local,
				e: tangent({ p: local, v: site.strike }),
				angle: (rng() * 2 - 1) * 0.35,
			})
		} else {
			const e1 = tangent({
				p: local,
				v: Math.abs(local[2]) < 0.9 ? [-local[1], local[0], 0] : [1, 0, 0],
			})
			const e2 = VEC3.cross({ a: local, b: e1 })
			const phi = rng() * TAU
			e = VEC3.unit([
				Math.cos(phi) * e1[0] + Math.sin(phi) * e2[0],
				Math.cos(phi) * e1[1] + Math.sin(phi) * e2[1],
				Math.cos(phi) * e1[2] + Math.sin(phi) * e2[2],
			])
		}
		const { s, sa } = place({
			kind: site.kind,
			rng,
			pos: local,
			axis: e,
			heightKm: h,
			radiusKm: r,
			rounded: f,
			floorKm: site.floorKm,
			active: site.active,
			armsFrom: null,
		})
		if (rng() < V.coneSatellites[site.kind]) {
			const count = rng() < 0.4 ? 2 : 1
			const q = VEC3.cross({ a: local, b: e })
			for (let i = 0; i < count; i++) {
				const arms = s[ARM_COUNT]
				let ang: number
				let along: number
				if (arms > 0) {
					const k = Math.floor(rng() * arms)
					ang = s[ARMS + 4 * k]
					along = (0.45 + 0.4 * rng()) * s[ARMS + 4 * k + 1]
				} else {
					ang = rng() < 0.5 ? 0 : Math.PI
					along = 0.45 + 0.4 * rng()
				}
				const da = (Math.cos(ang) * along * r * sa) / R
				const db = (Math.sin(ang) * along * r) / sa / R
				const sc = VEC3.unit([
					local[0] + da * e[0] + db * q[0],
					local[1] + da * e[1] + db * q[1],
					local[2] + da * e[2] + db * q[2],
				])
				const outward = tangent({
					p: sc,
					v: [
						da * e[0] + db * q[0],
						da * e[1] + db * q[1],
						da * e[2] + db * q[2],
					],
				})
				place({
					kind: site.kind,
					rng,
					pos: sc,
					axis: outward,
					heightKm: h * (0.4 + 0.3 * rng()),
					radiusKm: r * (0.45 + 0.2 * rng()),
					rounded: f,
					floorKm: site.floorKm,
					active: site.active,
					armsFrom: [0, 1],
				})
			}
		}
	}
	return out
}

function coneAt({
	edifice: k,
	px,
	py,
	pz,
	groundKm,
	radiusKm,
	noise,
}: ConeAtParams): number {
	const [cx, cy, cz] = k.pos
	const dx = px - cx
	const dy = py - cy
	const dz = pz - cz
	const rk = k.reachKm / radiusKm
	if (dx * dx + dy * dy + dz * dz >= rk * rk) return 0
	const [ex, ey, ez] = k.axis
	const qx = cy * ez - cz * ey
	const qy = cz * ex - cx * ez
	const qz = cx * ey - cy * ex
	const sa = Math.sqrt(k.aspect)
	const a0 = ((dx * ex + dy * ey + dz * ez) * radiusKm) / (k.radiusKm * sa)
	const b0 = ((dx * qx + dy * qy + dz * qz) * radiusKm * sa) / k.radiusKm
	const sh = k.shape
	const o1 = sh[NOISE]
	const o2 = sh[NOISE + 1]
	const warp = V.coneWarp
	const a = a0 + warp * noise.noise3D(a0 * 0.9 + o1, b0 * 0.9 + o2, 1.7)
	const b = b0 + warp * noise.noise3D(a0 * 0.9 + o2, b0 * 0.9 + o1, 5.3)
	const f = k.rounded
	const rho = Math.hypot(a, b)
	const th = Math.atan2(b, a)
	const outline =
		1 +
		sh[0] * Math.cos(th - sh[3]) +
		sh[1] * Math.cos(2 * th - sh[4]) +
		sh[2] * Math.cos(3 * th - sh[5]) +
		sh[6] * Math.cos(5 * th - sh[7])
	const rr = rho / outline
	let h = rr < 1 ? (1 - f) * (1 - rr) ** 1.7 + f * (1 - rr * rr) ** 2 : 0
	const arms = sh[ARM_COUNT]
	for (let i = 0; i < arms; i++) {
		const A = ARMS + 4 * i
		const ang = sh[A]
		const len = sh[A + 1]
		const ca = Math.cos(ang)
		const sn = Math.sin(ang)
		const along = a * ca + b * sn
		if (along >= len) continue
		const w0 = sh[A + 2] * (1 + 0.5 * f)
		const back = along < 0 ? Math.exp(-((along / (0.6 * w0)) ** 2)) : 1
		if (back < 0.01) continue
		const across = b * ca - a * sn
		const t = Math.max(0, along) / len
		const width =
			w0 *
			(1 - 0.45 * t) *
			(1 + 0.25 * Math.sin(4 * Math.max(0, along) + sh[WOBBLE] + 2 * i))
		const ha =
			back *
			sh[A + 3] *
			(1 - 0.3 * f) *
			(1 - t) ** 0.8 *
			Math.exp(-((across / width) ** 2))
		h = smoothMax({ a: h, b: ha })
	}
	if (h <= 0) return 0
	const depth = sh[RIB_DEPTH] * k.ribFade
	if (depth > 0 && rho > 0.25) {
		const phase =
			sh[RIBS] * th +
			sh[RIBS + 1] +
			sh[RIBS + 2] * Math.sin(2 * th + sh[RIBS + 3]) +
			sh[RIBS + 4] * Math.sin(3 * th + sh[RIBS + 5]) +
			sh[RIBS + 6] * rho * Math.sin(th + sh[RIBS + 7]) +
			1.5 * noise.noise3D(a * 1.4 + o2, b * 1.4 + o1, 9.1)
		const g = 0.5 + 0.5 * Math.cos(phase)
		h *= 1 - depth * smooth({ a: 0.25, b: 0.7, x: rho }) * g * g
	}
	const cut = sh[COLLAPSE + 2]
	if (cut > 0) {
		let dth = th - sh[COLLAPSE]
		dth -= TAU * Math.round(dth / TAU)
		const hw = sh[COLLAPSE + 1]
		if (Math.abs(dth) < hw)
			h *=
				1 - cut * (1 - (dth / hw) ** 2) * smooth({ a: 0.05, b: 0.45, x: rho })
	}
	h *= k.heightKm
	if (k.floorKm !== null) h = Math.max(0, k.floorKm + h - groundKm)
	return h
}

function stamp({
	mesh,
	planetRadiusKm,
	edifices,
	seed,
	heightKm,
}: StampEdificesParams): StampResult {
	const n = mesh.numRegions
	const { adjOffset, adjList, r_xyz } = mesh
	const index = MESH.buildRegionSpatialIndex(mesh)
	const noise = new SimplexNoise((seed * 41 + 7) >>> 0)
	const addedKm = new Float32Array(n)
	const hotspotKm = new Float32Array(n)
	const kindAt = new Uint8Array(n)
	const activity = new Float32Array(n)
	for (const unplaced of edifices) {
		const r0 = index.nearest(
			(Math.atan2(unplaced.pos[1], unplaced.pos[0]) * 180) / Math.PI,
			(Math.asin(Math.max(-1, Math.min(1, unplaced.pos[2]))) * 180) / Math.PI,
		)
		const cx = r_xyz[3 * r0]
		const cy = r_xyz[3 * r0 + 1]
		const cz = r_xyz[3 * r0 + 2]
		const edifice: Edifice = { ...unplaced, pos: [cx, cy, cz] }
		const cosReach = Math.cos(
			Math.min(Math.PI, edifice.reachKm / planetRadiusKm),
		)
		const seen = new Set([r0])
		const q = [r0]
		for (let h = 0; h < q.length; h++) {
			const r = q[h]
			const px = r_xyz[3 * r]
			const py = r_xyz[3 * r + 1]
			const pz = r_xyz[3 * r + 2]
			if (px * cx + py * cy + pz * cz < cosReach) continue
			const add = coneAt({
				edifice,
				px,
				py,
				pz,
				groundKm: heightKm[r],
				radiusKm: planetRadiusKm,
				noise,
			})
			if (add > 0.01) {
				if (add > addedKm[r]) {
					addedKm[r] = add
					kindAt[r] = KIND_CODE[edifice.kind]
				}
				if (edifice.kind === "hotspot")
					hotspotKm[r] = Math.max(hotspotKm[r], add)
				if (edifice.active && add >= V.activityCoreShare * edifice.heightKm)
					activity[r] = Math.max(activity[r], ACTIVITY_WEIGHT[edifice.kind])
			}
			for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
				const nb = adjList[k]
				if (!seen.has(nb)) {
					seen.add(nb)
					q.push(nb)
				}
			}
		}
	}
	return { addedKm, hotspotKm, kindAt, activity, count: edifices.length }
}

export const VOLCANO_EDIFICES = { hotspotSites, build, stamp }
