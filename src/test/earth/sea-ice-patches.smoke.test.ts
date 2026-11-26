import { expect, it } from "vitest"
import { SEA_ICE_PATCHES } from "@/model/climatev2/sea-ice-patches"

it("merges small ice and water spots while keeping larger features and land barriers", () => {
	const N = 183
	const adjOffset = new Int32Array(N + 1)
	const neighbors: number[] = []
	for (let r = 0; r < N; r++) {
		adjOffset[r] = neighbors.length
		if (r > 0) neighbors.push(r - 1)
		if (r + 1 < N) neighbors.push(r + 1)
	}
	adjOffset[N] = neighbors.length
	const expected = new Uint8Array(N)
	expected.fill(12, 60, 120)
	expected.fill(6, 120, 180)
	expected.fill(6, 24, 35)
	expected[10] = 12
	expected.fill(0, 82, 84)
	expected[81] = expected[84] = 6
	expected[100] = 6
	expected[145] = 12
	expected[181] = 12
	const months = expected.slice()
	const ocean = new Uint8Array(N).fill(1)
	ocean[180] = ocean[182] = 0
	SEA_ICE_PATCHES.merge({
		mesh: {
			numRegions: N,
			adjOffset,
			adjList: Int32Array.from(neighbors),
			regionArea: new Float32Array(N).fill((4 * Math.PI) / N),
		},
		months,
		ocean,
		monthCount: 12,
	})
	expected[10] = 0
	expected.fill(12, 81, 85)
	expected[100] = 12
	expected[145] = 6
	expect(months).toEqual(expected)
})
