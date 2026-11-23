import { describe, expect, it } from "vitest"
import { ARC_CRUST } from "@/model/geography/terrain/arc-crust"
import type { ArcCrust } from "@/model/geography/terrain/arc-crust/types"
import { ARC_HEIGHTS } from "@/model/geography/terrain/arc-heights"
import { HEIGHT_SCALE } from "@/model/geography/terrain/height-scale"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

const MAX_ELEV_KM = 6
const MAX_DEPTH_KM = 10

describe("arc heights", () => {
	it("keeps a young far arc at the ridge, a mature near arc on land and heights monotone in age", () => {
		expect(
			ARC_HEIGHTS.arcHeightKm({
				ageMyr: 0,
				kmToContinent: Infinity,
				island: 0.8,
			}),
		).toBeCloseTo(-2, 9)
		expect(
			ARC_HEIGHTS.arcHeightKm({ ageMyr: 150, kmToContinent: 200, island: 0 }),
		).toBeCloseTo(0, 9)
		expect(
			ARC_HEIGHTS.arcHeightKm({ ageMyr: 300, kmToContinent: 1500, island: 0 }),
		).toBeCloseTo(-0.2, 9)
		for (const island of [-1, 0, 1]) {
			for (const kmToContinent of [100, 600, 5000]) {
				let last = -Infinity
				for (let age = 0; age <= 200; age += 10) {
					const h = ARC_HEIGHTS.arcHeightKm({
						ageMyr: age,
						kmToContinent,
						island,
					})
					expect(h).toBeGreaterThanOrEqual(last)
					last = h
				}
			}
		}
	})

	it("deepens back-arc floor with age", () => {
		expect(ARC_HEIGHTS.seaDepthKm(0)).toBeCloseTo(2.6, 9)
		expect(ARC_HEIGHTS.seaDepthKm(25)).toBeGreaterThan(
			ARC_HEIGHTS.seaDepthKm(5),
		)
		expect(ARC_HEIGHTS.seaDepthKm(1e6)).toBe(6.4)
	})

	it("writes only the footprint, never raising the sea and never touching other cells", () => {
		const mesh = MESH.buildSphereMesh({
			n: 8000,
			jitter: 0.75,
			rng: RNG.createRng({ seed: 11 }),
		})
		const n = mesh.numRegions
		const crust: ArcCrust = {
			crustType: new Uint8Array(n),
			formedAtMyr: new Float32Array(n),
			shelfSea: new Uint8Array(n),
			sundaDeep: new Uint8Array(n),
			arcFront: new Uint8Array(n),
			reports: [],
		}
		const elev = new Float32Array(n)
		for (let c = 0; c < n; c++) {
			const x = mesh.r_xyz[3 * c]
			const z = mesh.r_xyz[3 * c + 2]
			const land = x < 0
			crust.crustType[c] = land
				? ARC_CRUST.CRUST.CONTINENT
				: ARC_CRUST.CRUST.OCEAN
			elev[c] = land ? 0.1 : -0.3
			if (Math.abs(z) > 0.25) continue
			if (x > 0.2 && x < 0.5) {
				crust.crustType[c] = ARC_CRUST.CRUST.ARC
				crust.formedAtMyr[c] = -80
			} else if (x > -0.5 && x < -0.2) {
				crust.crustType[c] = ARC_CRUST.CRUST.OCEAN
				crust.formedAtMyr[c] = -15
				crust.shelfSea[c] = c % 2
			}
		}
		const before = elev.slice()
		const marked = new Set<number>()
		ARC_HEIGHTS.stamp({
			mesh,
			planetRadiusKm: 6371,
			seed: 5,
			crust,
			elev,
			maxElevKm: MAX_ELEV_KM,
			maxDepthKm: MAX_DEPTH_KM,
			markFeature: (r) => {
				marked.add(r)
			},
		})
		let changed = 0
		for (let c = 0; c < n; c++) {
			const inFootprint =
				crust.crustType[c] === ARC_CRUST.CRUST.ARC ||
				(crust.crustType[c] === ARC_CRUST.CRUST.OCEAN &&
					crust.formedAtMyr[c] < 0)
			if (!inFootprint) {
				expect(elev[c]).toBe(before[c])
				continue
			}
			if (elev[c] !== before[c]) changed++
			if (crust.crustType[c] === ARC_CRUST.CRUST.OCEAN)
				expect(elev[c]).toBeLessThanOrEqual(before[c])
			expect(Number.isFinite(elev[c])).toBe(true)
		}
		expect(changed).toBeGreaterThan(0)
		expect(marked.size).toBeGreaterThan(0)
		for (let c = 0; c < n; c++) {
			if (crust.crustType[c] !== ARC_CRUST.CRUST.OCEAN) continue
			if (crust.formedAtMyr[c] >= 0) continue
			const km = HEIGHT_SCALE.elevToHeightKm({
				elev: elev[c],
				maxElevKm: MAX_ELEV_KM,
				maxDepthKm: MAX_DEPTH_KM,
			})
			expect(km).toBeLessThanOrEqual(0.1 + 1e-6)
		}
	})
})
