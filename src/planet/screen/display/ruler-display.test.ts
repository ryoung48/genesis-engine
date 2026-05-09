import { describe, expect, it } from "vitest"
import { YEAR_MS } from "@/model/history/state"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import { buildRulerDisplayMeta } from "./ruler-display"

describe("buildRulerDisplayMeta", () => {
	it("returns null fields when world is null", () => {
		const result = buildRulerDisplayMeta({
			world: null,
			nationId: 0,
			timeMs: 0,
		})
		expect(result.age).toBeNull()
		expect(result.gender).toBeNull()
		expect(result.genderSymbol).toBeNull()
		expect(result.claimStrength).toBeNull()
		expect(result.isRegency).toBe(false)
	})

	it("formats a strong claim", () => {
		const world = {
			leaderClaim: new Int32Array([3]),
			leaderBirthYear: new Float32Array([-1]),
			leaderNameSeed: new Int32Array([-1]),
		} as unknown as SerializedOrogenWorld
		const result = buildRulerDisplayMeta({ world, nationId: 0, timeMs: null })
		expect(result.claimStrength).toBe("Strong claim")
	})

	it("formats an average claim", () => {
		const world = {
			leaderClaim: new Int32Array([2]),
			leaderBirthYear: new Float32Array([-1]),
			leaderNameSeed: new Int32Array([-1]),
		} as unknown as SerializedOrogenWorld
		const result = buildRulerDisplayMeta({ world, nationId: 0, timeMs: null })
		expect(result.claimStrength).toBe("Average claim")
	})

	it("formats a weak claim", () => {
		const world = {
			leaderClaim: new Int32Array([1]),
			leaderBirthYear: new Float32Array([-1]),
			leaderNameSeed: new Int32Array([-1]),
		} as unknown as SerializedOrogenWorld
		const result = buildRulerDisplayMeta({ world, nationId: 0, timeMs: null })
		expect(result.claimStrength).toBe("Weak claim")
	})

	it("formats no claim", () => {
		const world = {
			leaderClaim: new Int32Array([0]),
			leaderBirthYear: new Float32Array([-1]),
			leaderNameSeed: new Int32Array([-1]),
		} as unknown as SerializedOrogenWorld
		const result = buildRulerDisplayMeta({ world, nationId: 0, timeMs: null })
		expect(result.claimStrength).toBe("No claim")
	})

	it("computes age and marks regency for a young ruler", () => {
		const world = {
			leaderClaim: new Int32Array([2]),
			leaderBirthYear: new Float32Array([10]),
			leaderNameSeed: new Int32Array([-1]),
		} as unknown as SerializedOrogenWorld
		const result = buildRulerDisplayMeta({
			world,
			nationId: 0,
			timeMs: 20 * YEAR_MS,
		})
		expect(result.age).toBe(10)
		expect(result.isRegency).toBe(true)
	})

	it("does not mark regency for adult rulers", () => {
		const world = {
			leaderClaim: new Int32Array([3]),
			leaderBirthYear: new Float32Array([0]),
			leaderNameSeed: new Int32Array([-1]),
		} as unknown as SerializedOrogenWorld
		const result = buildRulerDisplayMeta({
			world,
			nationId: 0,
			timeMs: 25 * YEAR_MS,
		})
		expect(result.age).toBe(25)
		expect(result.isRegency).toBe(false)
	})

	it("resolves gender when a valid leader seed is present", () => {
		const world = {
			leaderClaim: new Int32Array([2]),
			leaderBirthYear: new Float32Array([-1]),
			leaderNameSeed: new Int32Array([42]),
		} as unknown as SerializedOrogenWorld
		const result = buildRulerDisplayMeta({ world, nationId: 0, timeMs: null })
		expect(result.gender).not.toBeNull()
		expect(["male", "female"]).toContain(result.gender)
		expect(result.genderSymbol).not.toBeNull()
	})
})
