import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GenesisWorld } from ".."
import { generateGenesisWorld } from "../pipelines/generate-world"
import {
	clearWorldCacheForTests,
	getCachedWorld,
	TEST_WORLD_NUM_POINTS,
} from "./test-world"

vi.mock("../pipelines/generate-world", () => ({
	generateGenesisWorld: vi.fn(),
}))

const generateGenesisWorldMock = vi.mocked(generateGenesisWorld)

describe("test world cache", () => {
	beforeEach(() => {
		clearWorldCacheForTests()
		generateGenesisWorldMock.mockReset()
		generateGenesisWorldMock.mockImplementation(
			(params) =>
				({
					mesh: { numRegions: params.numPoints },
				}) as unknown as GenesisWorld,
		)
	})

	it("uses a smaller shared test world size by default", () => {
		getCachedWorld()

		expect(generateGenesisWorldMock).toHaveBeenCalledWith(
			expect.objectContaining({ numPoints: TEST_WORLD_NUM_POINTS }),
		)
	})

	it("reuses the cached world for identical params", () => {
		const first = getCachedWorld()
		const second = getCachedWorld()

		expect(first).toBe(second)
		expect(generateGenesisWorldMock).toHaveBeenCalledTimes(1)
	})

	it("creates a separate cache entry when params change", () => {
		getCachedWorld()
		getCachedWorld({ seed: 99999 })

		expect(generateGenesisWorldMock).toHaveBeenCalledTimes(2)
	})
})
