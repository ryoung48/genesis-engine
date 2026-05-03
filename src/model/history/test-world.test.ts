import { beforeEach, describe, expect, it, vi } from "vitest"
import type { OrogenWorld } from ".."
import { generateOrogenWorld } from "../pipelines/generate-world"
import {
	clearWorldCacheForTests,
	getCachedWorld,
	TEST_WORLD_NUM_POINTS,
} from "./test-world"

vi.mock("../pipelines/generate-world", () => ({
	generateOrogenWorld: vi.fn(),
}))

const generateOrogenWorldMock = vi.mocked(generateOrogenWorld)

describe("test world cache", () => {
	beforeEach(() => {
		clearWorldCacheForTests()
		generateOrogenWorldMock.mockReset()
		generateOrogenWorldMock.mockImplementation(
			(params) =>
				({
					mesh: { numRegions: params.numPoints },
				}) as unknown as OrogenWorld,
		)
	})

	it("uses a smaller shared test world size by default", () => {
		getCachedWorld()

		expect(generateOrogenWorldMock).toHaveBeenCalledWith(
			expect.objectContaining({ numPoints: TEST_WORLD_NUM_POINTS }),
		)
	})

	it("reuses the cached world for identical params", () => {
		const first = getCachedWorld()
		const second = getCachedWorld()

		expect(first).toBe(second)
		expect(generateOrogenWorldMock).toHaveBeenCalledTimes(1)
	})

	it("creates a separate cache entry when params change", () => {
		getCachedWorld()
		getCachedWorld({ seed: 99999 })

		expect(generateOrogenWorldMock).toHaveBeenCalledTimes(2)
	})
})
