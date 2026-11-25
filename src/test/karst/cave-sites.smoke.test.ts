import { beforeAll, describe, expect, it } from "vitest"
import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import { CAVES } from "@/model/geography/terrain/caves"
import { MESH } from "@/model/mesh"
import type { SphereMesh } from "@/model/mesh/types"
import { RNG } from "@/model/shared/random/rng"

const C = CAVE_CONFIG
const SEED = 4711
const SOLUTION = CAVES.typeCode.solution
const SINKHOLE = CAVES.typeCode.sinkhole
const GROTTO = CAVES.typeCode.grotto
const LAVA = CAVES.typeCode.lava
const SEA = CAVES.typeCode.sea

let mesh: SphereMesh
let isLand: Uint8Array
let openWater: Uint8Array

function potentials(fill: (type: number, region: number) => number) {
	return CAVES.types.map((_, t) =>
		Float32Array.from({ length: mesh.numRegions }, (_v, r) => fill(t, r)),
	)
}

function sites({
	seed = SEED,
	fill,
	long = new Uint8Array(mesh.numRegions),
}: {
	seed?: number
	fill: (type: number, region: number) => number
	long?: Uint8Array
}) {
	return CAVES.sites({
		mesh,
		seed,
		isLand,
		openWater,
		potentials: potentials(fill),
		long,
	})
}

function angle(region: number, x: number, y: number, z: number): number {
	const { r_xyz } = mesh
	const dot =
		r_xyz[3 * region] * x +
		r_xyz[3 * region + 1] * y +
		r_xyz[3 * region + 2] * z
	return Math.acos(
		Math.min(
			1,
			dot /
				Math.hypot(
					r_xyz[3 * region],
					r_xyz[3 * region + 1],
					r_xyz[3 * region + 2],
				),
		),
	)
}

describe("notable cave sites", () => {
	beforeAll(() => {
		mesh = MESH.buildSphereMesh({
			n: 30_000,
			jitter: 0.5,
			rng: RNG.createRng({ seed: 77031 }),
		})
		isLand = Uint8Array.from({ length: mesh.numRegions }, (_, r) =>
			mesh.r_xyz[3 * r + 2] > -0.2 ? 1 : 0,
		)
		openWater = Uint8Array.from(isLand, (land) => (land ? 0 : 1))
	}, 120_000)

	it("makes no site where potential is at or below the lower edge, and the site fraction at full potential is the site scale", () => {
		const none = sites({ fill: () => C.caveRange[0] })
		expect(none.region.length).toBe(0)
		const full = sites({ fill: (type) => (type === SOLUTION ? 1 : 0) })
		let land = 0
		for (const value of isLand) land += value
		expect(full.region.length / land).toBeGreaterThan(C.siteScale - 0.015)
		expect(full.region.length / land).toBeLessThan(C.siteScale + 0.015)
	})

	it("scales the site fraction of each type by its weight", () => {
		let land = 0
		for (const value of isLand) land += value
		for (const name of ["sea", "talus", "glacier"] as const) {
			const t = CAVES.typeCode[name]
			const only = sites({ fill: (type) => (type === t ? 1 : 0) })
			const expected = C.siteScale * C.typeWeight[name]
			expect(only.region.length / land).toBeGreaterThan(expected - 0.01)
			expect(only.region.length / land).toBeLessThan(expected + 0.01)
		}
	})

	it("keeps at most one site per region and type, sorted by region then type", () => {
		const all = sites({ fill: () => 1 })
		for (let i = 1; i < all.region.length; i++) {
			const before = all.region[i - 1] * 16 + all.type[i - 1]
			const now = all.region[i] * 16 + all.type[i]
			expect(now).toBeGreaterThan(before)
		}
	})

	it("is identical for one seed and different for another", () => {
		const a = sites({ fill: () => 1 })
		const b = sites({ fill: () => 1 })
		const c = sites({ seed: SEED + 1, fill: () => 1 })
		expect(Array.from(b.region)).toEqual(Array.from(a.region))
		expect(Array.from(b.xyz)).toEqual(Array.from(a.xyz))
		expect(Array.from(b.lengthM)).toEqual(Array.from(a.lengthM))
		expect(Array.from(c.region)).not.toEqual(Array.from(a.region))
	})

	it("draws different types independently", () => {
		const all = sites({
			fill: (type) => (type === SOLUTION || type === SINKHOLE ? 1 : 0),
		})
		const a = new Float64Array(mesh.numRegions)
		const b = new Float64Array(mesh.numRegions)
		for (let i = 0; i < all.region.length; i++)
			(all.type[i] === SOLUTION ? a : b)[all.region[i]] = 1
		let n = 0
		let sa = 0
		let sb = 0
		let sab = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if (!isLand[r]) continue
			n++
			sa += a[r]
			sb += b[r]
			sab += a[r] * b[r]
		}
		const cov = sab / n - (sa / n) * (sb / n)
		const sdA = Math.sqrt((sa / n) * (1 - sa / n))
		const sdB = Math.sqrt((sb / n) * (1 - sb / n))
		expect(Math.abs(cov / (sdA * sdB))).toBeLessThan(0.05)
	})

	function farthestNeighbor({
		region,
		accept,
	}: {
		region: number
		accept: (neighbor: number) => boolean
	}): number {
		let far = 0
		for (let k = mesh.adjOffset[region]; k < mesh.adjOffset[region + 1]; k++) {
			const nb = mesh.adjList[k]
			if (!accept(nb)) continue
			far = Math.max(
				far,
				angle(
					region,
					mesh.r_xyz[3 * nb],
					mesh.r_xyz[3 * nb + 1],
					mesh.r_xyz[3 * nb + 2],
				),
			)
		}
		return far
	}

	it("puts every site on the unit sphere within half a neighbour spacing of its region centre", () => {
		const all = sites({
			fill: (type) => (type === LAVA || type === SOLUTION ? 1 : 0),
		})
		expect(all.region.length).toBeGreaterThan(0)
		for (let i = 0; i < all.region.length; i++) {
			const x = all.xyz[3 * i]
			const y = all.xyz[3 * i + 1]
			const z = all.xyz[3 * i + 2]
			expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5)
			const r = all.region[i]
			expect(isLand[r]).toBe(1)
			const reach = farthestNeighbor({
				region: r,
				accept: (nb) => isLand[nb] === 1,
			})
			expect(angle(r, x, y, z)).toBeLessThanOrEqual(0.5 * reach + 1e-3)
		}
	})

	it("offsets sea sites from the region centre toward open water by the sea offset", () => {
		const sea = sites({
			fill: (type, r) => {
				if (type !== SEA) return 0
				for (let k = mesh.adjOffset[r]; k < mesh.adjOffset[r + 1]; k++)
					if (openWater[mesh.adjList[k]]) return 1
				return 0
			},
		})
		expect(sea.region.length).toBeGreaterThan(0)
		for (let i = 0; i < sea.region.length; i++) {
			const r = sea.region[i]
			const own = angle(
				r,
				sea.xyz[3 * i],
				sea.xyz[3 * i + 1],
				sea.xyz[3 * i + 2],
			)
			const reach = farthestNeighbor({
				region: r,
				accept: (nb) => openWater[nb] === 1,
			})
			expect(own).toBeGreaterThan(0)
			expect(own).toBeLessThanOrEqual(C.seaOffset * reach + 1e-3)
		}
	})
})

describe("passage length", () => {
	function lengthOf({
		type,
		long,
		draw,
	}: {
		type: number
		long: boolean
		draw: number
	}) {
		return CAVES.passageM({ type, long, draw })
	}

	it("puts solution sites in short regions between 30 and 300 m and in long regions at 300 m or more", () => {
		for (const type of [SOLUTION])
			for (let draw = 0; draw < 1; draw += 0.01) {
				const short = lengthOf({ type, long: false, draw })
				expect(short).toBeGreaterThanOrEqual(C.shortMinM - 1e-6)
				expect(short).toBeLessThanOrEqual(C.longCutM + 1e-6)
				const long = lengthOf({ type, long: true, draw })
				expect(long).toBeGreaterThanOrEqual(C.longCutM - 1e-6)
				expect(long).toBeLessThanOrEqual(C.longMaxM + 1e-6)
			}
	})

	it("always draws grotto sites from the short range", () => {
		for (let draw = 0; draw < 1; draw += 0.01) {
			const length = lengthOf({ type: GROTTO, long: true, draw })
			expect(length).toBeGreaterThanOrEqual(C.shortMinM - 1e-6)
			expect(length).toBeLessThanOrEqual(C.longCutM + 1e-6)
		}
	})

	it("keeps lava, sea, talus and glacier inside their fixed ranges", () => {
		for (const name of [
			"sinkhole",
			"lava",
			"sea",
			"talus",
			"glacier",
		] as const) {
			const [lo, hi] = C.fixedPassageM[name]
			for (let draw = 0; draw < 1; draw += 0.01) {
				const length = lengthOf({
					type: CAVES.typeCode[name],
					long: false,
					draw,
				})
				expect(length).toBeGreaterThanOrEqual(lo - 1e-6)
				expect(length).toBeLessThanOrEqual(hi + 1e-6)
			}
		}
	})

	it("has medians of about 150 m in short regions and 600 m in long regions", () => {
		const shortLengths: number[] = []
		const longLengths: number[] = []
		const rng = RNG.createRng({ seed: 5 })
		for (let i = 0; i < 50_000; i++) {
			const draw = rng.random()
			shortLengths.push(lengthOf({ type: SOLUTION, long: false, draw }))
			longLengths.push(lengthOf({ type: SOLUTION, long: true, draw }))
		}
		shortLengths.sort((a, b) => a - b)
		longLengths.sort((a, b) => a - b)
		expect(shortLengths[25_000]).toBeGreaterThan(150 * 0.9)
		expect(shortLengths[25_000]).toBeLessThan(150 * 1.1)
		expect(longLengths[25_000]).toBeGreaterThan(600 * 0.9)
		expect(longLengths[25_000]).toBeLessThan(600 * 1.1)
	})
})
