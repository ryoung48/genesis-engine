import { CRUST } from "@/model/geography/tectonics/crust"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import type {
	BuildPlumesParams,
	LipLiftParams,
	Plume,
	PlumeRecord,
	StampDiscParams,
} from "@/model/geography/terrain/plumes/types"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { VEC3 } from "@/model/shared/math/vec3"
import type { Vec3 } from "@/model/shared/math/vec3/types"
import { RNG } from "@/model/shared/random/rng"

const P = PRESENT_CONFIG

function lerpPair({
	pair,
	t,
}: {
	pair: readonly [number, number]
	t: number
}): number {
	return pair[0] + (pair[1] - pair[0]) * t
}

function stampDisc({ space, x, radiusKm, fn }: StampDiscParams): void {
	const { adjOffset, adjList, r_xyz } = space.mesh
	const c0 = space.nearest({ x: x[0], y: x[1], z: x[2] })
	const seen = new Set([c0])
	const q = [c0]
	const cosR = Math.cos(radiusKm / space.radiusKm)
	for (let h = 0; h < q.length; h++) {
		const c = q[h]
		if (VEC3.dot({ a: VEC3.at({ xyz: r_xyz, cell: c }), b: x }) < cosR) continue
		fn(c)
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const nb = adjList[k]
			if (!seen.has(nb)) {
				seen.add(nb)
				q.push(nb)
			}
		}
	}
}

function ownRng({
	seed,
	salt,
	key,
}: {
	seed: number
	salt: number
	key: number
}): () => number {
	return RNG.makeRng(((seed ^ salt) + key * 7919) >>> 0)
}

function placePlumes({ space, crust, seed }: BuildPlumesParams): Plume[] {
	const rng = RNG.makeRng((seed ^ 0x9105) >>> 0)
	const count =
		P.plumeCount[0] +
		Math.floor(rng() * (P.plumeCount[1] - P.plumeCount[0] + 1))
	const plumes: Plume[] = []
	for (let tries = 0; plumes.length < count && tries < 400; tries++) {
		const tr = ownRng({ seed, salt: 0x9106, key: tries })
		const z = 2 * tr() - 1
		const th = 2 * Math.PI * tr()
		const r = Math.sqrt(1 - z * z)
		const p: Vec3 = [r * Math.cos(th), r * Math.sin(th), z]
		const keep = tr()
		const strength = 0.6 + 0.8 * tr()
		const cell = space.nearest({ x: p[0], y: p[1], z: p[2] })
		const onLand = crust.type[cell] !== CRUST.TYPE.OCEAN
		if (keep > (onLand ? 1 : P.plumeOceanWeight)) continue
		if (
			plumes.some(
				(q) =>
					VEC3.greatCircleKm({ a: q.p, b: p, radiusKm: space.radiusKm }) <
					P.plumeApartKm,
			)
		)
			continue
		plumes.push({
			id: plumes.length,
			key: tries,
			p,
			cell,
			plate: crust.plate[cell],
			strength,
			trackMyr: 0,
		})
	}
	return plumes
}

function build(params: BuildPlumesParams): PlumeRecord {
	const { space, crust, motion, seed } = params
	const { r_xyz } = space.mesh
	const R = space.radiusKm
	const plumes = placePlumes(params)
	const lipRng = RNG.makeRng((seed ^ 0x11b5) >>> 0)
	const lipBudget =
		P.lipCount[0] + Math.floor(lipRng() * (P.lipCount[1] - P.lipCount[0] + 1))
	let lips = 0
	const cellOf = (p: Vec3) => space.nearest({ x: p[0], y: p[1], z: p[2] })
	for (const pl of plumes) {
		const brng = ownRng({ seed, salt: 0xb057, key: pl.key })
		const lrng = ownRng({ seed, salt: 0x11b6, key: pl.key })
		const pv = motion.plates.vec.get(pl.plate)
		if (!pv) continue
		const wl = (pv.omega * motion.cmYrPerUnit * 10) / R
		if (wl === 0) continue
		const k = VEC3.unit(pv.pole)
		let t = 0
		let burstEnd = 0
		let quietEnd = 0
		while (t <= P.trackMyr) {
			const x = VEC3.rotateAbout({ p: pl.p, axis: k, angle: wl * t })
			const c = cellOf(x)
			if (crust.plate[c] !== pl.plate) break
			if (t >= quietEnd && t >= burstEnd) {
				const dur = lerpPair({ pair: P.burstMyr, t: brng() })
				burstEnd = t + dur
				quietEnd = burstEnd + lerpPair({ pair: P.quietMyr, t: brng() })
				const mid = t + 0.5 * dur
				const xc = VEC3.rotateAbout({ p: pl.p, axis: k, angle: wl * mid })
				const height = Math.min(
					P.trackMaxKm,
					P.trackBuildKmPerMyr * pl.strength * dur * (0.5 + 0.9 * brng()),
				)
				stampDisc({
					space,
					x: xc,
					radiusKm: P.volcanoRadiusKm,
					fn: (cc) => {
						if (
							crust.volcKm[cc] < height ||
							crust.volcType[cc] !== CRUST.VOLCANIC.TRACK
						) {
							crust.volcType[cc] = CRUST.VOLCANIC.TRACK
							crust.volcAt[cc] = -mid
							crust.volcKm[cc] = height
							crust.volcSource[cc] = pl.id + 1
							crust.volcWornKm[cc] =
								P.islandErosionKmPerMyr * Math.max(0, mid - P.activeMyr)
						}
					},
				})
			}
			stampDisc({
				space,
				x,
				radiusKm: P.trackRibbonKm,
				fn: (cc) => {
					if (crust.volcType[cc]) return
					crust.volcType[cc] = CRUST.VOLCANIC.TRACK
					crust.volcAt[cc] = -t
					crust.volcKm[cc] = 0.3 * pl.strength
					crust.volcSource[cc] = pl.id + 1
				},
			})
			t += P.trackStepMyr
		}
		if (lips < lipBudget && lrng() < P.lipChance) {
			const age = Math.min(Math.max(P.lipAgeMyr[0], t * lrng()), P.lipAgeMyr[1])
			const x = VEC3.rotateAbout({
				p: pl.p,
				axis: k,
				angle: wl * Math.min(age, t),
			})
			const area =
				P.lipAreaKm2[0] *
				Math.exp(Math.log(P.lipAreaKm2[1] / P.lipAreaKm2[0]) * lrng())
			const r0 = Math.sqrt(area / Math.PI)
			const noise = new SimplexNoise((seed ^ (0x1d0 + pl.key)) >>> 0)
			const lobes = [lrng(), lrng(), lrng()].map((v) => 2 * Math.PI * v)
			const ref = VEC3.unit([-x[2], 0, x[0]])
			const refNormal = VEC3.cross({ a: x, b: ref })
			let cells = 0
			stampDisc({
				space,
				x,
				radiusKm: 1.6 * r0,
				fn: (cc) => {
					const q = VEC3.at({ xyz: r_xyz, cell: cc })
					const d = VEC3.greatCircleKm({ a: q, b: x, radiusKm: R })
					const tq = VEC3.unit([q[0] - x[0], q[1] - x[1], q[2] - x[2]])
					const ang = Math.atan2(
						VEC3.dot({ a: tq, b: refNormal }),
						VEC3.dot({ a: tq, b: ref }),
					)
					let lobe = 0
					for (const l of lobes) lobe += Math.max(0, Math.cos(ang - l)) ** 3
					const edge =
						r0 *
						(0.75 +
							0.45 * lobe +
							0.25 * noise.noise3D(q[0] * 6, q[1] * 6, q[2] * 6))
					if (d > edge) return
					crust.volcType[cc] = CRUST.VOLCANIC.LIP
					crust.volcAt[cc] = -age
					crust.volcKm[cc] = P.lipThicknessKm
					crust.volcSource[cc] = pl.id + 1
					crust.volcWornKm[cc] =
						crust.type[cc] === CRUST.TYPE.OCEAN ? 0 : P.lipWearKmPerMyr * age
					crust.flags[cc] |= CRUST.FLAG.LIP
					cells++
				},
			})
			if (cells) {
				lips++
				pl.lip = { ageMyr: age, areaKm2: area, cells }
			}
		}
		pl.trackMyr = t
	}
	return { plumes }
}

function lift({
	crust,
	cellOfRegion,
	mesh,
	planetRadiusKm,
}: LipLiftParams): Float32Array {
	const n = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const base = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		const c = cellOfRegion[r]
		if (crust.volcType[c] !== CRUST.VOLCANIC.LIP) continue
		const pile = Math.min(
			P.lipMaxPileKm,
			Math.max(0, crust.volcKm[c] - crust.volcWornKm[c]),
		)
		base[r] =
			pile *
			(crust.type[c] === CRUST.TYPE.OCEAN ? P.lipSeaKmPerKm : P.lipLandKmPerKm)
	}
	const edgeKm = Math.sqrt((8 * Math.PI) / (Math.sqrt(3) * n)) * planetRadiusKm
	const passes = Math.max(1, Math.round(P.lipFeatherKm / edgeKm))
	let a = base.slice()
	let b = new Float32Array(n)
	for (let pass = 0; pass < passes; pass++) {
		for (let r = 0; r < n; r++) {
			let sum = a[r]
			for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) sum += a[adjList[k]]
			const v = sum / (1 + adjOffset[r + 1] - adjOffset[r])
			b[r] = Math.max(v, base[r])
		}
		const t = a
		a = b
		b = t
	}
	return a
}

export const PLUMES = { build, lift }
