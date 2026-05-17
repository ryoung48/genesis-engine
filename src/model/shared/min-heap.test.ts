import { describe, expect, it } from "vitest"
import { MinHeap } from "./min-heap"

describe("MinHeap", () => {
	it("can be cleared and reused with the same key array", () => {
		const keys = new Float32Array([3, 1, 2, 0.5])
		const heap = new MinHeap(keys)

		heap.push(0)
		heap.push(1)
		expect(heap.pop()).toBe(1)

		heap.clear()
		expect(heap.size).toBe(0)

		heap.push(2)
		heap.push(3)
		expect(heap.pop()).toBe(3)
		expect(heap.pop()).toBe(2)
		expect(heap.size).toBe(0)
	})
})
