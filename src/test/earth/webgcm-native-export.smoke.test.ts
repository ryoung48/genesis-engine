import { describe, expect, it } from "vitest"
import { WEBGCM_NATIVE } from "@/model/climate/export/webgcm/native"
import { NATIVE_PACKET } from "@/model/climate/export/webgcm/native/packet/index.mjs"
import type { NativeWorldFile } from "@/model/climate/export/webgcm/native/types"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"

describe("native GCM export", () => {
	it("preserves mesh, IDs and explicit geography without rasterization", async () => {
		const mesh = MESH.buildSphereMesh({
			n: 128,
			jitter: 0.75,
			rng: RNG.createRng({ seed: 42 }),
		})
		const isLand = Uint8Array.from({ length: mesh.numRegions }, (_, i) =>
			Number(i % 3 === 0),
		)
		const elevation_km = Float32Array.from(isLand, (land) => (land ? 1 : -4))
		const world = {
			mesh,
			isLand,
			elevation_km,
			params: { planetRadiusKm: 6371, hoursPerDay: 23.93447232 },
		}
		const file = await WEBGCM_NATIVE.createFile({
			world,
			onProgress: () => undefined,
		})
		const decoded = NATIVE_PACKET.decode({ buffer: file }) as NativeWorldFile
		expect(decoded.format).toBe("chaos-native-world-v1")
		expect(decoded.input.mesh).toEqual(mesh)
		expect(decoded.input.land).toEqual(isLand)
		expect(decoded.input.elevationKm).toEqual(elevation_km)
		expect(decoded.input.radiusM).toBe(6371000)
		expect(decoded.rotationSeconds).toBe(world.params.hoursPerDay * 3600)
		await expect(
			WEBGCM_NATIVE.createFile({
				world: { ...world, isLand: new Uint8Array(0) },
				onProgress: () => undefined,
			}),
		).rejects.toThrow("incomplete geography")
	})
})
