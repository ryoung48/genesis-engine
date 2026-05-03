import { describe, expect, it } from "vitest"
import { MinHeap } from "./min-heap"

describe("MinHeap", () => {
	it("startsEmpty", () => {
		const keys = new Float32Array(10)
		const heap = new MinHeap(keys)
		expect(heap.size).toBe(0)
	})

	it("popsInAscendingKeyOrder", () => {
		const keys = new Float32Array([5, 1, 3, 2, 4])
		const heap = new MinHeap(keys)
		heap.push(0) // key 5
		heap.push(1) // key 1
		heap.push(2) // key 3
		heap.push(3) // key 2
		heap.push(4) // key 4

		const order = [heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop()]
		expect(order).toEqual([1, 3, 2, 4, 0])
	})

	it("sizeDecrementsOnPop", () => {
		const keys = new Float32Array([1, 2])
		const heap = new MinHeap(keys)
		heap.push(0)
		heap.push(1)
		expect(heap.size).toBe(2)
		heap.pop()
		expect(heap.size).toBe(1)
	})

	it("handlesEqualKeys", () => {
		const keys = new Float32Array([3, 3, 3])
		const heap = new MinHeap(keys)
		heap.push(0)
		heap.push(1)
		heap.push(2)
		// All keys equal — all should pop without error
		const results = [heap.pop(), heap.pop(), heap.pop()]
		expect(results.sort()).toEqual([0, 1, 2])
	})

	it("handlesSingleElement", () => {
		const keys = new Float32Array([7])
		const heap = new MinHeap(keys)
		heap.push(0)
		expect(heap.pop()).toBe(0)
		expect(heap.size).toBe(0)
	})
})
