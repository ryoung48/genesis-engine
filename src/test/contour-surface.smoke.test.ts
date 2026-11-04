import { describe, expect, it } from "vitest"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"
import { CONTOUR_SURFACE } from "@/ui/genesis/renderer/contours/surface"
import type { ContourWorld } from "@/ui/genesis/renderer/contours/surface/types"

const mesh = MESH.buildSphereMesh({
	n: 100,
	jitter: 0.5,
	rng: RNG.createRng({ seed: 7 }),
})

function elevationWorld(elevation_km: Float32Array): ContourWorld {
	return {
		mesh,
		elevation_km,
		tidalRange: null,
		ocean: new Uint8Array(mesh.numRegions),
	}
}

describe("contour surface", () => {
	it("fills land from the ocean tidal range and masks land faces", () => {
		const ocean = Uint8Array.from({ length: mesh.numRegions }, (_, r) =>
			mesh.r_xyz[3 * r + 2] > 0 ? 0 : 1,
		)
		const tidalRange = Float32Array.from(ocean, (isOcean) => (isOcean ? 2 : 9))
		const world = {
			mesh,
			elevation_km: new Float32Array(mesh.numRegions),
			tidalRange,
			ocean,
		}
		const surface = CONTOUR_SURFACE.create({ world, field: "tidal" })
		expect(
			surface.regionValues.every((value) => Math.abs(value - 2) < 1e-5),
		).toBe(true)
		const controls = new Float32Array(3 * CONTOUR_SURFACE.stride)
		const mismatches = Array.from({ length: mesh.numSides }, (_, side) => {
			CONTOUR_SURFACE.writeControls({
				world,
				surface,
				field: "tidal",
				innerTriangle: mesh.s_inner_t[side],
				outerTriangle: mesh.s_outer_t[side],
				region: mesh.s_begin_r[side],
				mapOrder: false,
				controls,
				face: 0,
			})
			return controls[10] !== ocean[mesh.s_begin_r[side]]
		}).filter(Boolean).length
		expect(mismatches).toBe(0)
	})

	it("smooths an isolated spike without changing the source heights", () => {
		const elevation_km = Float32Array.from(
			{ length: mesh.numRegions },
			(_, r) => (mesh.r_xyz[3 * r + 2] > 0 ? 1 : -1),
		)
		const spike = elevation_km.findIndex((h) => h > 0)
		elevation_km[spike] = 5
		const original = elevation_km.slice()
		const surface = CONTOUR_SURFACE.create({
			world: elevationWorld(elevation_km),
			field: "elevation",
		})
		expect(surface.regionValues[spike]).toBeGreaterThan(-1)
		expect(surface.regionValues[spike]).toBeLessThan(2)
		expect(elevation_km).toEqual(original)
		const a = mesh.s_begin_r[0],
			b = mesh.s_begin_r[1],
			c = mesh.s_begin_r[2]
		expect(surface.triangleValues[0]).toBeCloseTo(
			(original[a] + original[b] + original[c]) / 3,
			6,
		)
	})

	it("preserves a constant elevation", () => {
		const elevation_km = new Float32Array(mesh.numRegions).fill(3)
		const surface = CONTOUR_SURFACE.create({
			world: elevationWorld(elevation_km),
			field: "elevation",
		})
		expect(surface.regionValues).toEqual(elevation_km)
		expect(surface.regionSlopes.every((value) => Math.abs(value) < 1e-5)).toBe(
			true,
		)
	})

	it("keeps the same curve on both sides of every shared triangle edge", () => {
		const elevation_km = Float32Array.from(
			{ length: mesh.numRegions },
			(_, r) => 2 + mesh.r_xyz[3 * r + 2] + Math.sin(r) * 0.5,
		)
		const world = elevationWorld(elevation_km)
		const surface = CONTOUR_SURFACE.create({ world, field: "elevation" })
		const controls = new Float32Array(3 * CONTOUR_SURFACE.stride)
		const shared = new Map<string, number[]>()
		let mismatches = 0,
			checked = 0
		for (let side = 0; side < mesh.numSides; side++) {
			const innerTriangle = mesh.s_inner_t[side],
				outerTriangle = mesh.s_outer_t[side],
				region = mesh.s_begin_r[side]
			if (outerTriangle < 0) continue
			CONTOUR_SURFACE.writeControls({
				world,
				surface,
				field: "elevation",
				innerTriangle,
				outerTriangle,
				region,
				mapOrder: false,
				controls,
				face: 0,
			})
			const ids = [`t${innerTriangle}`, `r${region}`, `t${outerTriangle}`]
			for (const [a, b, forward, reverse] of [
				[0, 1, 4, 5],
				[1, 2, 6, 7],
				[2, 0, 8, 9],
			]) {
				const order = ids[a] < ids[b]
				const key = order ? `${ids[a]}:${ids[b]}` : `${ids[b]}:${ids[a]}`
				const values = order
					? [controls[a], controls[forward], controls[reverse], controls[b]]
					: [controls[b], controls[reverse], controls[forward], controls[a]]
				const previous = shared.get(key)
				if (previous) {
					checked++
					if (values.some((value, i) => value !== previous[i])) mismatches++
				} else shared.set(key, values)
			}
		}
		expect(checked).toBeGreaterThan(0)
		expect(mismatches).toBe(0)
	})
})
